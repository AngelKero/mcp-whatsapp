const path = require('path');
const { execSync } = require('child_process');
const { askSystemOne, classifyExpenseCategory } = require('./system-one-client.js');

const OCR_BIN = path.join(__dirname, 'bin', 'apple-vision-ocr');

const NOTION_CATEGORIES = {
  SALIDAS: '3e6853a1-d77e-81e9-be73-f6a732b6831f', // Salidas & Estilo de Vida (Citas, Hobbies, Comida)
  SUSCRIPCIONES: '3e6853a1-d77e-812b-901b-d355d84881b8',
  SERVICIOS_HOGAR: '3e6853a1-d77e-8189-ad16-e316489b7003',
  INTERNET_CELULAR: '3e6853a1-d77e-8178-877f-c90a70ed89f2',
  RENTA: '265853a1-d77e-80b2-89b6-ec9f43ed090d'
};

const BANK_SIGNATURES = [
  { name: 'BBVA', regex: /\b(?:bbva|bancomer)\b/i },
  { name: 'Nu', regex: /\b(?:nu\s+mexico|cuenta\s+nu|tarjeta\s+nu)\b|\bnu\b/i },
  { name: 'Mercado Pago', regex: /\b(?:mercado\s*pago|mercadolibre)\b/i },
  { name: 'Citibanamex', regex: /\b(?:citibanamex|banamex)\b/i },
  { name: 'Santander', regex: /\b(?:santander|supermovil)\b/i },
  { name: 'Banorte', regex: /\bbanorte\b/i },
  { name: 'HSBC', regex: /\bhsbc\b/i },
  { name: 'Spin by OXXO', regex: /\b(?:spin\s+by\s+oxxo|spin\s+oxxo)\b/i },
  { name: 'Hey Banco', regex: /\bhey\s+banco\b/i },
  { name: 'Didi Pay', regex: /\b(?:didi\s+pay|didi\s+food)\b/i },
  { name: 'Uber Eats', regex: /\buber\s+eats\b/i }
];

const RETAIL_SIGNATURES = [
  { name: 'OXXO', regex: /\b(?:cadena\s+comercial\s+oxxo|oxxo)\b/i, cat: NOTION_CATEGORIES.SALIDAS },
  { name: '7-Eleven', regex: /\b(?:7-eleven|seven\s+eleven)\b/i, cat: NOTION_CATEGORIES.SALIDAS },
  { name: 'Farmacias Guadalajara', regex: /\bfarmacias?\s+guadalajara\b/i, cat: NOTION_CATEGORIES.SALIDAS },
  { name: 'Walmart', regex: /\b(?:walmart|bodega\s+aurrera|sam'?s\s+club)\b/i, cat: NOTION_CATEGORIES.SERVICIOS_HOGAR },
  { name: 'Costco', regex: /\bcostco\b/i, cat: NOTION_CATEGORIES.SERVICIOS_HOGAR },
  { name: 'Starbucks', regex: /\bstarbucks\b/i, cat: NOTION_CATEGORIES.SALIDAS },
  { name: 'Little Caesars', regex: /\blittle\s+caesars\b/i, cat: NOTION_CATEGORIES.SALIDAS },
  { name: 'Carls Jr', regex: /\bcarl'?s\s*jr\b/i, cat: NOTION_CATEGORIES.SALIDAS },
  { name: 'Uber', regex: /\buber\b/i, cat: null },
  { name: 'Didi', regex: /\bdidi\b/i, cat: null }
];

class ReceiptParser {
  /**
   * Ejecuta el OCR nativo de Apple Vision sobre la imagen
   */
  runOcr(imagePath) {
    try {
      const output = execSync(`"${OCR_BIN}" "${imagePath}"`, {
        encoding: 'utf-8',
        timeout: 10000,
        maxBuffer: 10 * 1024 * 1024
      });

      const lines = [];
      for (const row of output.split('\n')) {
        if (!row.trim()) continue;
        const [text, conf, x, y, w, h] = row.split('\t');
        lines.push({
          text: (text || '').trim(),
          confidence: parseFloat(conf) || 1.0,
          x: parseFloat(x) || 0,
          y: parseFloat(y) || 0,
          w: parseFloat(w) || 0,
          h: parseFloat(h) || 0
        });
      }
      return lines;
    } catch (err) {
      console.error('[RECEIPT PARSER] Error ejecutando Apple Vision OCR:', err.message);
      return [];
    }
  }

  /**
   * Determina si el texto extraído corresponde a un comprobante bancario o ticket mediante Laya-MLX
   */
  async isReceiptOrTicket(fullText) {
    if (!fullText || fullText.length < 15) return false;

    try {
      const q = {
        es_comprobante: {
          type: 'choice',
          instructions: '¿El texto de esta imagen corresponde a un ticket, factura, comprobante de transferencia bancaria o recibo de compra?',
          criteria: {
            si: 'Sí, es un comprobante de pago, transferencia, compra, voucher o ticket de tienda',
            no: 'No, es una foto personal, documento de texto, código, meme o captura de pantalla general'
          }
        }
      };
      const layaRes = await askSystemOne(fullText.slice(0, 600), q);
      return layaRes?.answers?.es_comprobante?.choice === 'si' && (layaRes?.answers?.es_comprobante?.confidence || 0) > 0.55;
    } catch (err) {
      console.error('[RECEIPT PARSER] Error en Laya-MLX isReceiptOrTicket:', err.message);
      return false;
    }
  }

  /**
   * Extrae el monto de la transacción
   */
  extractAmount(lines, fullText) {
    // 1. Priorizar líneas que explícitamente digan TOTAL (común en tickets de retail), ignorando 'subtotal'
    for (const l of lines) {
      const mTotal = l.text.match(/(?<!sub)\b(?:total|total\s+mxn)\b\s*:?\s*\$?\s*([0-9]{1,3}(?:[,\.][0-9]{3})*(?:[,\.][0-9]{2})|[0-9]+(?:[\.,][0-9]{2})?)/i);
      if (mTotal) {
        const val = parseFloat(mTotal[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0 && val < 500000) return val;
      }
    }

    // 2. Priorizar líneas con Importe / Monto / Transferido / Pagado (común en apps bancarias)
    for (const l of lines) {
      const mImp = l.text.match(/\b(?:importe|monto|transferido|pagado|pagaste|cantidad)\b\s*:?\s*\$?\s*([0-9]{1,3}(?:[,\.][0-9]{3})*(?:[,\.][0-9]{2})|[0-9]+(?:[\.,][0-9]{2})?)/i);
      if (mImp) {
        const val = parseFloat(mImp[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0 && val < 500000) return val;
      }
    }

    // 3. Buscar todas las cifras con signo de pesos en el documento y tomar la mayor
    const allMatches = fullText.match(/\$\s*([0-9]+(?:[\.,][0-9]{2})?)/g);
    if (allMatches) {
      const candidates = allMatches.map(str => {
        const clean = str.replace(/[^\d\.]/g, '');
        return parseFloat(clean);
      }).filter(n => !isNaN(n) && n > 0 && n < 500000);

      if (candidates.length > 0) {
        return Math.max(...candidates);
      }
    }

    return null;
  }

  /**
   * Extrae el banco o comercio emisor
   */
  extractMerchantOrBank(fullText) {
    for (const b of BANK_SIGNATURES) {
      if (b.regex.test(fullText)) {
        return { type: 'bank', name: b.name };
      }
    }
    for (const r of RETAIL_SIGNATURES) {
      if (r.regex.test(fullText)) {
        return { type: 'retail', name: r.name, cat: r.cat };
      }
    }
    return { type: 'general', name: 'Comprobante de compra' };
  }

  /**
   * Extrae el concepto o beneficiario de la transferencia
   */
  extractConcept(lines, merchantOrBank) {
    // 1. Priorizar 'Concepto:' o 'Motivo:' (describe exactamente el gasto)
    for (const l of lines) {
      const m = l.text.match(/(?:concepto|motivo)\s*:?\s*(.+)/i);
      if (m && m[1] && m[1].trim().length > 2) {
        return m[1].trim();
      }
    }

    // 2. Si no hay concepto explícito, buscar 'Destinatario:', 'Beneficiario:' o 'Para:'
    for (const l of lines) {
      const m = l.text.match(/(?:destinatario|beneficiario|para|transferido\s+a|enviado\s+a)\s*:?\s*(.+)/i);
      if (m && m[1] && m[1].trim().length > 2) {
        return `Transferencia a ${m[1].trim()}`;
      }
    }

    // 3. Si es un comercio conocido, usar el nombre del comercio
    if (merchantOrBank.name && merchantOrBank.type === 'retail') {
      return `Compra en ${merchantOrBank.name}`;
    }

    if (merchantOrBank.name && merchantOrBank.type === 'bank') {
      return `Transferencia ${merchantOrBank.name}`;
    }

    return 'Gasto registrado vía comprobante';
  }

  /**
   * Infiere la categoría en Notion según el concepto y comercio usando Laya-MLX
   */
  async resolveCategory(concept, merchantName) {
    const text = `${concept} ${merchantName}`.trim();

    try {
      const layaCat = await classifyExpenseCategory(text);
      if (layaCat) {
        if (layaCat === 'salidas') return NOTION_CATEGORIES.SALIDAS;
        if (layaCat === 'suscripciones') return NOTION_CATEGORIES.SUSCRIPCIONES;
        if (layaCat === 'servicios_hogar') return NOTION_CATEGORIES.SERVICIOS_HOGAR;
        if (layaCat === 'internet_celular') return NOTION_CATEGORIES.INTERNET_CELULAR;
        if (layaCat === 'renta') return NOTION_CATEGORIES.RENTA;
      }
    } catch (err) {
      console.error('[RECEIPT PARSER] Error en Laya-MLX:', err.message);
    }

    return NOTION_CATEGORIES.SALIDAS; // Default a Salidas & Estilo de vida
  }

  /**
   * Método principal: analiza una imagen y devuelve los datos estructurados
   */
  async parseReceipt(imagePath) {
    const lines = this.runOcr(imagePath);
    if (!lines || lines.length === 0) {
      return { isReceipt: false, reason: 'No se detectó texto en la imagen' };
    }

    const fullText = lines.map(l => l.text).join('\n');
    const isReceipt = await this.isReceiptOrTicket(fullText);

    if (!isReceipt) {
      return { isReceipt: false, reason: 'La imagen no corresponde a un comprobante o ticket según Laya-MLX' };
    }

    const merchantOrBank = this.extractMerchantOrBank(fullText);
    const amount = this.extractAmount(lines, fullText);
    const concept = this.extractConcept(lines, merchantOrBank);
    const categoryId = merchantOrBank.cat || await this.resolveCategory(concept, merchantOrBank.name);

    // Fecha: usar fecha de hoy en formato YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];

    const categoryNamesMap = {
      '3e6853a1-d77e-81e9-be73-f6a732b6831f': 'Salidas & Citas',
      '3e6853a1-d77e-812b-901b-d355d84881b8': 'Suscripciones',
      '3e6853a1-d77e-8189-ad16-e316489b7003': 'Servicios Hogar',
      '3e6853a1-d77e-8178-877f-c90a70ed89f2': 'Internet & Celular',
      '265853a1-d77e-80b2-89b6-ec9f43ed090d': 'Renta'
    };

    return {
      isReceipt: true,
      bankOrMerchant: merchantOrBank.name,
      amount: amount || 0,
      concept: concept,
      categoryId: categoryId,
      categoryName: categoryNamesMap[categoryId] || 'Salidas & Citas',
      date: today,
      rawLinesCount: lines.length
    };
  }

  /**
   * Obtiene todo el texto detectado mediante Apple Vision OCR (para imágenes generales)
   */
  getTextFromImage(imagePath) {
    const lines = this.runOcr(imagePath);
    if (!lines || lines.length === 0) return '';
    return lines.map(l => l.text).join('\n').trim();
  }
}

const defaultInstance = new ReceiptParser();
defaultInstance.ReceiptParser = ReceiptParser;
defaultInstance.BANK_SIGNATURES = BANK_SIGNATURES;
defaultInstance.RETAIL_SIGNATURES = RETAIL_SIGNATURES;
defaultInstance.NOTION_CATEGORIES = NOTION_CATEGORIES;
module.exports = defaultInstance;
