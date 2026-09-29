const https = require('https');

const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY || '';

/**
 * Cola Centralizada Token Bucket para la API de Notion.
 * - Límite de tasa: 1 petición cada 350 ms (~2.85 req/s) para respetar el límite de 3 req/s.
 * - Manejo automático de backpressure: detecta HTTP 429 (rate_limited) y 529 (service_overload).
 * - Pausa dinámica respetando la cabecera Retry-After con exponential backoff y jitter (±20%).
 */
class NotionQueue {
  constructor(rateLimitIntervalMs = 350, maxRetries = 4) {
    this.rateLimitIntervalMs = rateLimitIntervalMs;
    this.maxRetries = maxRetries;
    this.queue = [];
    this.isProcessing = false;
    this.pausedUntil = 0;
  }

  enqueue(apiPath, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        apiPath,
        method,
        body,
        resolve,
        reject,
        retries: 0
      });

      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      if (now < this.pausedUntil) {
        const waitMs = this.pausedUntil - now;
        await new Promise(r => setTimeout(r, waitMs));
      }

      const item = this.queue.shift();
      if (!item) break;

      try {
        const result = await this.executeRequest(item);
        item.resolve(result);
      } catch (err) {
        // Manejo de Rate Limiting (429) o Sobrecarga (529)
        if (err.statusCode === 429 || err.statusCode === 529) {
          const retryAfterSec = err.retryAfter || (Math.pow(2, item.retries) + Math.random() * 0.5);
          console.warn(`[NOTION QUEUE] ⚠️ Rate limit detectado (${err.statusCode}). Pausando cola por ${retryAfterSec}s...`);

          this.pausedUntil = Date.now() + (retryAfterSec * 1000);

          if (item.retries < this.maxRetries) {
            item.retries += 1;
            this.queue.unshift(item); // Reinsertar al inicio de la cola
          } else {
            console.error(`[NOTION QUEUE] ❌ Reintentos agotados para ${item.apiPath}`);
            item.reject(err);
          }
        } else {
          item.reject(err);
        }
      }

      // Intervalo de seguridad entre peticiones exitosas (Token Bucket)
      await new Promise(r => setTimeout(r, this.rateLimitIntervalMs));
    }

    this.isProcessing = false;
  }

  executeRequest(item) {
    return new Promise((resolve, reject) => {
      const postData = item.body ? JSON.stringify(item.body) : null;
      const headers = {
        'Authorization': `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
        ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      };

      const req = https.request({
        hostname: 'api.notion.com',
        path: `/v1${item.apiPath}`,
        method: item.method,
        headers: headers,
        timeout: 25000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }

          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const err = new Error(`Notion [${res.statusCode}]: ${parsed?.message || data}`);
            err.statusCode = res.statusCode;
            const retryHeader = res.headers['retry-after'];
            if (retryHeader) {
              err.retryAfter = parseFloat(retryHeader);
            }
            reject(err);
          }
        });
      });

      req.on('error', (e) => reject(e));
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout conectando con Notion API'));
      });

      if (postData) req.write(postData);
      req.end();
    });
  }
}

const sharedQueue = new NotionQueue(350);

module.exports = {
  NotionQueue,
  sharedQueue,
  notionRequest: (apiPath, method = 'GET', body = null) => sharedQueue.enqueue(apiPath, method, body)
};
