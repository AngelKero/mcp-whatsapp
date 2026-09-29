#!/usr/bin/env node
/**
 * pdf-parser.js
 * Extrae texto de archivos PDF recibidos por WhatsApp
 */
const fs = require('fs');
const pdf = require('pdf-parse');

class PdfParser {
  async extractText(pdfPath, maxPages = 15) {
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Archivo PDF no encontrado: ${pdfPath}`);
    }

    try {
      const dataBuffer = fs.readFileSync(pdfPath);
      const data = await pdf(dataBuffer, {
        max: maxPages
      });

      return {
        success: true,
        pages: data.numpages,
        info: data.info,
        text: (data.text || '').trim()
      };
    } catch (err) {
      console.error('[PDF PARSER] Error leyendo PDF:', err.message);
      return {
        success: false,
        error: err.message,
        text: ''
      };
    }
  }
}

module.exports = new PdfParser();
