const path = require('path');

/**
 * config/env.js
 * Fuente única de verdad para configuración, tokens, credenciales y rutas de binarios.
 * Principio DIP: Las capas de negocio no conocen valores hardcodeados.
 */

module.exports = {
  // Credenciales y Tokens (via env; nunca hardcodear)
  NOTION_TOKEN: process.env.NOTION_TOKEN || process.env.NOTION_API_KEY || '',

  // Números y JIDs de WhatsApp. El número del dueño tiene fallback endurecido
  // (spec cron-dispatch): sin .env ni dotenv en launchd, el env llega vacío y
  // TODO lo dirigido a MY_PHONE_* iba a la nada; el fallback evita esa clase.
  // El número ya existe literal en watcher/permissions; centralizarlo aquí no
  // expone nada nuevo.
  MY_PHONE_JID: process.env.MY_PHONE_JID || '5213325094748@s.whatsapp.net',
  ERIKA_PHONE_JID: process.env.ERIKA_PHONE_JID || '',
  MY_PHONE_NUMBER: process.env.MY_PHONE_NUMBER || '5213325094748',
  ERIKA_PHONE_NUMBER: process.env.ERIKA_PHONE_NUMBER || '',

  // Rutas de Bases de Datos SQLite
  DB_PATHS: {
    MESSAGES: path.join(__dirname, '..', 'store', 'messages.db'),
    REMINDERS: path.join(__dirname, '..', 'store', 'reminders.db'),
    AUDIT_LOG: path.join(__dirname, '..', 'store', 'audit-log.db')
  },

  // Rutas de Binarios y Scripts Externos
  BINARIES: {
    OCR_BIN: path.join(__dirname, '..', 'bin', 'apple-vision-ocr'),
    PYTHON_VOICE: '/Users/angelzaragoza/Library/Application Support/VoiceMCP/venv/bin/python3',
    PYTHON_GRAPHIFY: path.resolve(process.env.HOME, '.local/share/uv/tools/graphifyy/bin/python'),
    AGY_BIN: '/Users/angelzaragoza/.local/bin/agy',
    TRANSCRIBER_SCRIPT: path.resolve(process.env.HOME, '.gemini/config/scripts/class-transcriber-mcp.py')
  },

  // Microservicio Local Laya-MLX (Sistema 1 en GPU Metal)
  SYSTEM_ONE_URL: 'http://127.0.0.1:8766/v1/systemone',

  // Zona Horaria Oficial
  TIMEZONE: 'America/Mexico_City'
};

if (!process.env.MY_PHONE_JID || !process.env.MY_PHONE_NUMBER) {
  console.warn('[ENV] MY_PHONE_JID/NUMBER sin env: usando fallback endurecido del dueño.');
}
