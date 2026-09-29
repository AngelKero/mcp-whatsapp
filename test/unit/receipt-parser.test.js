const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const receiptParser = require('../../receipt-parser.js');

describe('ReceiptParser Unit Suite', () => {
  describe('extractMerchantOrBank()', () => {
    it('debe identificar bancos mexicanos y neobancos por firma de texto', () => {
      const cases = [
        { text: 'Transferencia exitosa BBVA México\nCuenta de retiro: *1234', expected: 'BBVA' },
        { text: 'Comprobante de transferencia Nu México S.A.', expected: 'Nu' },
        { text: 'Comprobante de operación Mercado Pago wallet', expected: 'Mercado Pago' },
        { text: 'Transferencia interbancaria SPEI Citibanamex', expected: 'Citibanamex' },
        { text: 'Operación efectuada en Supermovil Santander', expected: 'Santander' },
        { text: 'Spin by OXXO comprobante de depósito', expected: 'Spin by OXXO' }
      ];

      for (const c of cases) {
        const res = receiptParser.extractMerchantOrBank(c.text);
        assert.equal(res.type, 'bank');
        assert.equal(res.name, c.expected);
      }
    });

    it('debe identificar comercios y cadenas de retail con su categoría asociada', () => {
      const cases = [
        { text: 'Cadena Comercial OXXO\nTienda Providencia', expected: 'OXXO', hasCat: true },
        { text: 'Starbucks Coffee Plaza Patria\nTicket de consumo', expected: 'Starbucks', hasCat: true },
        { text: 'Little Caesars Pizza Guadalajara Centro', expected: 'Little Caesars', hasCat: true },
        { text: 'Walmart Supercenter Chapultepec', expected: 'Walmart', hasCat: true }
      ];

      for (const c of cases) {
        const res = receiptParser.extractMerchantOrBank(c.text);
        assert.equal(res.type, 'retail');
        assert.equal(res.name, c.expected);
        if (c.hasCat) {
          assert.ok(res.cat, 'Debe asignar categoría de Notion predeterminada');
        }
      }
    });

    it('debe retornar fallback general para tickets desconocidos', () => {
      const res = receiptParser.extractMerchantOrBank('Tacos Don Pancho\nOrden de 5 pastor y agua fresca');
      assert.equal(res.type, 'general');
      assert.equal(res.name, 'Comprobante de compra');
    });
  });

  describe('extractAmount()', () => {
    it('debe extraer el total exacto cuando existe línea con "TOTAL"', () => {
      const lines = [
        { text: 'Subtotal: $150.00' },
        { text: 'IVA: $24.00' },
        { text: 'TOTAL: $174.00' }
      ];
      const fullText = lines.map(l => l.text).join('\n');
      const amount = receiptParser.extractAmount(lines, fullText);
      assert.equal(amount, 174);
    });

    it('debe extraer el importe de transferencias SPEI o bancarias', () => {
      const lines = [
        { text: 'BBVA Transferencia' },
        { text: 'Importe: $1,250.50' },
        { text: 'Comisión: $0.00' }
      ];
      const fullText = lines.map(l => l.text).join('\n');
      const amount = receiptParser.extractAmount(lines, fullText);
      assert.equal(amount, 1250.50);
    });

    it('debe soportar la palabra "Pagado" o "Cantidad"', () => {
      const lines = [
        { text: 'Monto pagado: $349.00' }
      ];
      const fullText = lines.map(l => l.text).join('\n');
      const amount = receiptParser.extractAmount(lines, fullText);
      assert.equal(amount, 349);
    });

    it('debe encontrar la cifra mayor si no hay etiquetas explícitas', () => {
      const lines = [
        { text: 'Precio unitario: $30.00' },
        { text: 'Descuento: $5.00' },
        { text: 'Saldo final $250.00' }
      ];
      const fullText = lines.map(l => l.text).join('\n');
      const amount = receiptParser.extractAmount(lines, fullText);
      assert.equal(amount, 250);
    });
  });

  describe('extractConcept()', () => {
    it('debe priorizar la etiqueta "Concepto:" o "Motivo:"', () => {
      const lines = [
        { text: 'BBVA Bancomer' },
        { text: 'Concepto: Pago de renta septiembre' },
        { text: 'Para: Luis Rodriguez' }
      ];
      const concept = receiptParser.extractConcept(lines, { type: 'bank', name: 'BBVA' });
      assert.equal(concept, 'Pago de renta septiembre');
    });

    it('debe fallback a Beneficiario / Destinatario si no hay concepto', () => {
      const lines = [
        { text: 'Transferencia Nu' },
        { text: 'Beneficiario: Erika Sofia Ramirez' },
        { text: 'Importe: $400.00' }
      ];
      const concept = receiptParser.extractConcept(lines, { type: 'bank', name: 'Nu' });
      assert.equal(concept, 'Transferencia a Erika Sofia Ramirez');
    });

    it('debe fallback a nombre del comercio o banco si no hay beneficiario ni concepto', () => {
      const lines = [
        { text: 'Ticket de compra' },
        { text: 'Total: $85.00' }
      ];
      const conceptRetail = receiptParser.extractConcept(lines, { type: 'retail', name: 'OXXO' });
      assert.equal(conceptRetail, 'Compra en OXXO');

      const conceptBank = receiptParser.extractConcept(lines, { type: 'bank', name: 'BBVA' });
      assert.equal(conceptBank, 'Transferencia BBVA');
    });
  });
});
