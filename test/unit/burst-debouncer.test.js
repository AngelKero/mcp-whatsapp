const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Importamos o instanciamos una versión de prueba de ChatQueueManager
// replicando exactamente la lógica de whatsapp-watcher.js
class TestChatQueueManager {
  constructor(debounceMs = 100, handler = null) {
    this.debounceMs = debounceMs;
    this.handler = handler;
    this.queues = new Map();
  }

  _getOrCreate(chatJid) {
    let q = this.queues.get(chatJid);
    if (!q) {
      q = {
        timer: null,
        items: [],
        isProcessing: false,
        pendingMediaCount: 0,
        lastEnqueueTime: 0
      };
      this.queues.set(chatJid, q);
    }
    return q;
  }

  startMediaPending(chatJid, msgId) {
    const q = this._getOrCreate(chatJid);
    q.pendingMediaCount++;
    if (q.timer) {
      clearTimeout(q.timer);
      q.timer = null;
    }
  }

  finishMediaPending(chatJid, msgId) {
    const q = this.queues.get(chatJid);
    if (!q) return;
    q.pendingMediaCount = Math.max(0, q.pendingMediaCount - 1);

    if (q.pendingMediaCount === 0 && q.items.length > 0 && !q.isProcessing) {
      if (q.timer) clearTimeout(q.timer);
      q.timer = setTimeout(() => this.dispatch(chatJid), this.debounceMs);
    }
  }

  enqueue(chatJid, item) {
    const q = this._getOrCreate(chatJid);
    q.items.push(item);
    q.lastEnqueueTime = Date.now();

    if (q.pendingMediaCount > 0) {
      if (q.timer) {
        clearTimeout(q.timer);
        q.timer = null;
      }
      return;
    }

    if (q.isProcessing) {
      return;
    }

    if (q.timer) clearTimeout(q.timer);
    q.timer = setTimeout(() => this.dispatch(chatJid), this.debounceMs);
  }

  async dispatch(chatJid) {
    const q = this.queues.get(chatJid);
    if (!q || q.items.length === 0) return;

    if (q.pendingMediaCount > 0) {
      if (q.timer) clearTimeout(q.timer);
      q.timer = setTimeout(() => this.dispatch(chatJid), 20);
      return;
    }

    if (q.isProcessing) {
      if (q.timer) clearTimeout(q.timer);
      q.timer = setTimeout(() => this.dispatch(chatJid), 20);
      return;
    }

    const elapsedSinceLastEnqueue = Date.now() - q.lastEnqueueTime;
    if (elapsedSinceLastEnqueue < this.debounceMs) {
      const waitTime = this.debounceMs - elapsedSinceLastEnqueue;
      if (q.timer) clearTimeout(q.timer);
      q.timer = setTimeout(() => this.dispatch(chatJid), Math.max(10, waitTime));
      return;
    }

    q.isProcessing = true;
    if (q.timer) {
      clearTimeout(q.timer);
      q.timer = null;
    }

    const batch = [...q.items];
    batch.sort((a, b) => {
      const rA = a.msg?.rowid || 0;
      const rB = b.msg?.rowid || 0;
      if (rA && rB) return rA - rB;
      const tA = new Date(a.msg?.timestamp || 0).getTime();
      const tB = new Date(b.msg?.timestamp || 0).getTime();
      return tA - tB;
    });

    q.items = [];

    try {
      if (this.handler) await this.handler(chatJid, batch);
    } catch (err) {
      // Ignorar para prueba
    } finally {
      q.isProcessing = false;
      if (q.items.length > 0) {
        if (q.timer) clearTimeout(q.timer);
        q.timer = setTimeout(() => this.dispatch(chatJid), this.debounceMs);
      } else if (q.pendingMediaCount === 0) {
        this.queues.delete(chatJid);
      }
    }
  }
}

describe('BurstDebouncer & Multimodal Cohesion Suite', () => {
  it('debe agrupar ráfagas de texto en un único lote consolidado', async () => {
    const batches = [];
    const queue = new TestChatQueueManager(50, async (chatJid, batch) => {
      batches.push({ chatJid, batch });
    });

    const chatJid = '5216311152237@s.whatsapp.net';
    queue.enqueue(chatJid, { text: 'Mensaje 1', msg: { rowid: 1 } });
    await new Promise(r => setTimeout(r, 20));
    queue.enqueue(chatJid, { text: 'Mensaje 2', msg: { rowid: 2 } });
    await new Promise(r => setTimeout(r, 20));
    queue.enqueue(chatJid, { text: 'Mensaje 3', msg: { rowid: 3 } });

    // Esperar a que expire el debounce (50ms tras el último mensaje)
    await new Promise(r => setTimeout(r, 120));

    assert.equal(batches.length, 1, 'Debió despachar exactamente un solo lote');
    assert.equal(batches[0].batch.length, 3, 'El lote debe contener los 3 mensajes');
    assert.equal(batches[0].batch[0].text, 'Mensaje 1');
    assert.equal(batches[0].batch[1].text, 'Mensaje 2');
    assert.equal(batches[0].batch[2].text, 'Mensaje 3');
  });

  it('debe retener el despacho de texto si hay una extracción multimedia en progreso', async () => {
    const batches = [];
    const queue = new TestChatQueueManager(60, async (chatJid, batch) => {
      batches.push({ chatJid, batch });
    });

    const chatJid = '5216311152237@s.whatsapp.net';
    
    // 1. Llega texto
    queue.enqueue(chatJid, { text: 'Mira este sticker', msg: { rowid: 10 } });

    // 2. Inicia análisis multimedia del sticker 30ms después (antes de que expire el debounce de 60ms)
    await new Promise(r => setTimeout(r, 30));
    queue.startMediaPending(chatJid, 'sticker-123');

    // 3. Pasamos 80ms (tiempo suficiente para que el timer viejo hubiera disparado si no estuviera pausado)
    await new Promise(r => setTimeout(r, 80));
    assert.equal(batches.length, 0, 'No debió despachar mientras el sticker está en análisis');

    // 4. Termina el análisis del sticker y se encola en la cola
    queue.enqueue(chatJid, { text: '[Sticker: Gato sorprendido]', msg: { rowid: 11 } });
    queue.finishMediaPending(chatJid, 'sticker-123');

    // 5. Esperar el debounce final
    await new Promise(r => setTimeout(r, 120));

    assert.equal(batches.length, 1, 'Debió despachar ambos elementos juntos en un único turno');
    assert.equal(batches[0].batch.length, 2);
    assert.equal(batches[0].batch[0].text, 'Mira este sticker');
    assert.equal(batches[0].batch[1].text, '[Sticker: Gato sorprendido]');
  });

  it('debe ordenar cronológicamente los mensajes aunque el sticker tarde más en procesar', async () => {
    const batches = [];
    const queue = new TestChatQueueManager(50, async (chatJid, batch) => {
      batches.push({ chatJid, batch });
    });

    const chatJid = '5216311152237@s.whatsapp.net';

    // El sticker llegó primero (rowid 100), pero su extracción tarda
    queue.startMediaPending(chatJid, 'sticker-first');

    // Mientras el sticker se descarga, llega un texto (rowid 101)
    queue.enqueue(chatJid, { text: 'Qué significa este sticker?', msg: { rowid: 101 } });

    // 50ms después termina el sticker y se encola
    await new Promise(r => setTimeout(r, 50));
    queue.enqueue(chatJid, { text: '[Sticker: Pingüino]', msg: { rowid: 100 } });
    queue.finishMediaPending(chatJid, 'sticker-first');

    // Esperar debounce
    await new Promise(r => setTimeout(r, 100));

    assert.equal(batches.length, 1);
    assert.equal(batches[0].batch.length, 2);
    // Debe haber quedado ordenado por rowid: sticker (100) primero, texto (101) después
    assert.equal(batches[0].batch[0].text, '[Sticker: Pingüino]');
    assert.equal(batches[0].batch[1].text, 'Qué significa este sticker?');
  });

  it('debe manejar múltiples descargas multimedia simultáneas sin desfasarse', async () => {
    const batches = [];
    const queue = new TestChatQueueManager(50, async (chatJid, batch) => {
      batches.push({ chatJid, batch });
    });

    const chatJid = '5216311152237@s.whatsapp.net';

    // 2 stickers en ráfaga
    queue.startMediaPending(chatJid, 'media-1');
    queue.startMediaPending(chatJid, 'media-2');

    await new Promise(r => setTimeout(r, 30));
    queue.enqueue(chatJid, { text: '[Sticker 1]', msg: { rowid: 201 } });
    queue.finishMediaPending(chatJid, 'media-1');

    // Todavía queda media-2 pendiente, no debe despachar
    await new Promise(r => setTimeout(r, 60));
    assert.equal(batches.length, 0, 'No debe despachar si aún queda media-2 pendiente');

    queue.enqueue(chatJid, { text: '[Sticker 2]', msg: { rowid: 202 } });
    queue.finishMediaPending(chatJid, 'media-2');

    await new Promise(r => setTimeout(r, 100));
    assert.equal(batches.length, 1);
    assert.equal(batches[0].batch.length, 2);
  });
});
