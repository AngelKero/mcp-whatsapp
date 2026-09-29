/**
 * modules/stickers/sticker-vision.js
 * Analizador de Visión Semántica para Stickers y Memes de WhatsApp.
 * Combina OCR instantáneo local (Apple Vision) con inferencia VLM (Antigravity agy)
 * para derivar intención, emoción, nombre de meme y contexto pragmático.
 */

const path = require('path');
const { execFile, execSync } = require('child_process');
const fs = require('fs');

const OCR_BIN = path.join(__dirname, '..', '..', 'bin', 'apple-vision-ocr');
const AGY_BIN = '/Users/angelzaragoza/.local/bin/agy';

class StickerVision {
  /**
   * Extrae texto visible usando Apple Vision en ~30ms
   */
  runLocalOcr(filePath) {
    if (!fs.existsSync(OCR_BIN) || !fs.existsSync(filePath)) return '';
    try {
      const output = execSync(`"${OCR_BIN}" "${filePath}"`, {
        encoding: 'utf-8',
        timeout: 5000,
        maxBuffer: 2 * 1024 * 1024
      });
      return output
        .split('\n')
        .map(line => line.split('\t')[0] || '')
        .filter(t => t.trim().length > 0)
        .join(' ')
        .trim();
    } catch {
      return '';
    }
  }

  /**
   * Sanitiza cadenas de texto para prevenir inyecciones de prompt tipográficas
   */
  sanitizeText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // caracteres de control
      .replace(/<[^>]*>/g, '') // tags html
      .replace(/([`$\\])/g, ' ') // caracteres especiales de escape
      .slice(0, 300)
      .trim();
  }

  /**
   * Analiza un sticker o imagen y genera su ficha semántica estructurada
   */
  async analyzeMedia(filePath, senderName = 'Usuario') {
    const ocrText = this.runLocalOcr(filePath);
    const absPath = path.resolve(filePath);

    const prompt = `Analiza la imagen o sticker en este archivo: "${absPath}"
Texto detectado por OCR previo: "${ocrText || 'ninguno'}"

Tu tarea es clasificar este sticker o meme para un agente de WhatsApp que habla con devs mexicanos.
Responde ÚNICAMENTE un bloque de código JSON con esta estructura exacta:
{
  "meme_name": "Nombre o personaje del meme/sticker (ej: Cheems pensativo, Homero arbusto, Gato riéndose)",
  "visual_description": "Descripción visual concisa de 1 oración de lo que se ve en la imagen",
  "emotion": "Emoción transmitida en 2-4 palabras (ej: duda existencial, burla cómplice, orgullo, desvelo)",
  "intent": "Intención comunicativa (ej: celebrar logro, evadir pregunta, queja con humor, asentir)",
  "ocr_text": "Texto exacto visible en la imagen si lo hay",
  "tags": ["etiqueta1", "etiqueta2", "personaje", "tema"],
  "emojis": "1 a 3 emojis acordes",
  "suggested_contexts": "Cuándo usar este sticker en un chat"
}`;

    return new Promise((resolve) => {
      const args = [
        '--model', 'gemini-3.8-flash-low',
        '--effort', 'low',
        '--disable-slash-commands',
        '-p', prompt,
        '--output-format', 'json',
        '--dangerously-skip-permissions'
      ];

      execFile(AGY_BIN, args, {
        timeout: 60000,
        maxBuffer: 5 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: `/Users/angelzaragoza/.local/bin:/Users/angelzaragoza/.nvm/versions/node/v24.11.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`
        }
      }, (error, stdout) => {
        if (error || !stdout) {
          console.warn('[STICKER VISION] Fallback local por error en agy:', error?.message);
          return resolve(this.buildFallbackProfile(absPath, ocrText));
        }

        try {
          const parsedCli = JSON.parse(stdout.trim());
          const responseText = parsedCli.response || '';
          
          // Extraer JSON dentro de bloque ```json ... ``` o texto
          const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const rawJson = jsonMatch[1] || jsonMatch[0];
            const profile = JSON.parse(rawJson);
            
            return resolve({
              meme_name: this.sanitizeText(profile.meme_name) || path.basename(absPath, path.extname(absPath)),
              visual_description: this.sanitizeText(profile.visual_description) || 'Sticker o meme compartido en WhatsApp',
              emotion: this.sanitizeText(profile.emotion) || 'humor / reacción',
              intent: Array.isArray(profile.intent) ? profile.intent.map(i => this.sanitizeText(i)).join(', ') : this.sanitizeText(profile.intent),
              ocr_text: this.sanitizeText(profile.ocr_text || ocrText),
              tags: Array.isArray(profile.tags) ? profile.tags.map(t => this.sanitizeText(t)).filter(Boolean) : ['sticker', 'meme'],
              emojis: profile.emojis || ':3',
              suggested_contexts: this.sanitizeText(profile.suggested_contexts) || 'Conversación casual en WhatsApp'
            });
          }
        } catch (e) {
          console.warn('[STICKER VISION] Error parseando respuesta VLM:', e.message);
        }

        resolve(this.buildFallbackProfile(absPath, ocrText));
      });
    });
  }

  buildFallbackProfile(absPath, ocrText) {
    const base = path.basename(absPath, path.extname(absPath));
    return {
      meme_name: base.replace(/[-_]/g, ' '),
      visual_description: ocrText ? `Sticker con texto: "${ocrText}"` : `Sticker ${base}`,
      emotion: 'reacción / humor',
      intent: 'expresar complicidad o remate',
      ocr_text: this.sanitizeText(ocrText),
      tags: ['sticker', 'whatsapp', base],
      emojis: '✨',
      suggested_contexts: 'Reacción a comentario o broma'
    };
  }
}

const stickerVision = new StickerVision();

module.exports = stickerVision;
module.exports.StickerVision = StickerVision;
