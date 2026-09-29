/**
 * modules/permissions/chat-permissions.js
 * Gestión de autonomía y permisos modulares por chat + killswitch global.
 *
 * DB: store/chat-permissions.db (override con env CHAT_PERMISSIONS_DB_PATH, útil en tests)
 *
 * Esquema:
 *   chat_permissions(chat_jid PK, chat_name, autonomy_mode, allow_notion, allow_media, updated_at)
 *   bot_global_config(key PK, value)  -- 'global_enabled' = '1' | '0'
 *
 * Modos:
 *   SILENT        -> bot ignora 100% del chat (salvo !panel/!admin de Ángel)
 *   MENTIONS_ONLY -> solo invocación explícita (!ia, !buscar, @antigravity...)
 *   AUTONOMOUS    -> LURK_MODE + ACTIVE + contexto completo
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');
const { isMarketplaceChat } = require('../../config/marketplace-filter.js');
const { MY_PHONE_JID, MY_PHONE_NUMBER, DB_PATHS } = require('../../config/env.js');

const AUTONOMY_MODES = ['SILENT', 'MENTIONS_ONLY', 'AUTONOMOUS'];
const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'store', 'chat-permissions.db');

let dbPathOverride = process.env.CHAT_PERMISSIONS_DB_PATH || null;
let db = null;

function getDbPath() {
  return dbPathOverride || process.env.CHAT_PERMISSIONS_DB_PATH || DEFAULT_DB_PATH;
}

/** Solo para tests: redirige la BD a un archivo temporal. */
function _setDbPath(p) {
  try { if (db) db.close(); } catch {}
  db = null;
  dbPathOverride = p;
}

/** Cierra el handle (tests / shutdown limpio). */
function _closeDb() {
  try { if (db) db.close(); } catch {}
  db = null;
}

function getDb() {
  if (db) return db;
  const p = getDbPath();
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
  db = new DatabaseSync(p);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_permissions (
      chat_jid TEXT PRIMARY KEY,
      chat_name TEXT,
      autonomy_mode TEXT DEFAULT 'MENTIONS_ONLY',
      allow_notion INTEGER DEFAULT 1,
      allow_media INTEGER DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS bot_global_config (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    INSERT OR IGNORE INTO bot_global_config (key, value) VALUES ('global_enabled', '1');
  `);
  return db;
}

function normalizeBool(v, fallback = 1) {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v ? 1 : 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(s)) return 1;
    if (['0', 'false', 'no', 'off'].includes(s)) return 0;
  }
  return fallback;
}

/**
 * Defaults inteligentes cuando el chat no tiene fila en la BD.
 * - Marketplace (ventas/bazares) -> SILENT
 * - Chat propio de Ángel      -> AUTONOMOUS
 * - Resto                     -> MENTIONS_ONLY
 */
function defaultAutonomyMode(chatJid, contactName = '') {
  if (isMarketplaceChat(chatJid, contactName || '')) return 'SILENT';
  if (!chatJid) return 'MENTIONS_ONLY';
  if (chatJid === MY_PHONE_JID || chatJid.startsWith(MY_PHONE_NUMBER)) return 'AUTONOMOUS';
  return 'MENTIONS_ONLY';
}

function toPermissionObject(row, chatJid, contactName = '') {
  if (row) {
    return {
      chat_jid: row.chat_jid,
      chat_name: row.chat_name || contactName || '',
      autonomy_mode: AUTONOMY_MODES.includes(row.autonomy_mode) ? row.autonomy_mode : 'MENTIONS_ONLY',
      allow_notion: row.allow_notion === 0 ? 0 : 1,
      allow_media: row.allow_media === 0 ? 0 : 1,
      updated_at: row.updated_at || null,
      is_custom: true
    };
  }
  return {
    chat_jid: chatJid,
    chat_name: contactName || '',
    autonomy_mode: defaultAutonomyMode(chatJid, contactName),
    allow_notion: 1,
    allow_media: 1,
    updated_at: null,
    is_custom: false
  };
}

function getChatPermission(chatJid, contactName = '') {
  if (!chatJid) {
    return toPermissionObject(null, chatJid || '', contactName);
  }
  try {
    const database = getDb();
    const row = database.prepare('SELECT * FROM chat_permissions WHERE chat_jid = ?').get(chatJid);
    return toPermissionObject(row, chatJid, contactName);
  } catch {
    return toPermissionObject(null, chatJid, contactName);
  }
}

function setChatPermission(chatJid, opts = {}) {
  if (!chatJid || typeof chatJid !== 'string') {
    throw new TypeError('chatJid requerido');
  }
  const { autonomy_mode, allow_notion, allow_media, chat_name } = opts;
  if (autonomy_mode !== undefined && !AUTONOMY_MODES.includes(autonomy_mode)) {
    throw new RangeError(`autonomy_mode inválido: ${autonomy_mode}. Usa ${AUTONOMY_MODES.join('|')}`);
  }
  const database = getDb();
  const current = getChatPermission(chatJid, chat_name || '');
  const next = {
    autonomy_mode: autonomy_mode || current.autonomy_mode,
    allow_notion: allow_notion !== undefined ? normalizeBool(allow_notion, current.allow_notion) : current.allow_notion,
    allow_media: allow_media !== undefined ? normalizeBool(allow_media, current.allow_media) : current.allow_media,
    chat_name: chat_name !== undefined ? String(chat_name) : (current.chat_name || '')
  };
  database.prepare(`
    INSERT INTO chat_permissions (chat_jid, chat_name, autonomy_mode, allow_notion, allow_media, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(chat_jid) DO UPDATE SET
      chat_name = excluded.chat_name,
      autonomy_mode = excluded.autonomy_mode,
      allow_notion = excluded.allow_notion,
      allow_media = excluded.allow_media,
      updated_at = CURRENT_TIMESTAMP
  `).run(chatJid, next.chat_name, next.autonomy_mode, next.allow_notion, next.allow_media);
  return getChatPermission(chatJid, next.chat_name);
}

function isGlobalEnabled() {
  try {
    const database = getDb();
    const row = database.prepare("SELECT value FROM bot_global_config WHERE key = 'global_enabled'").get();
    if (!row) return true;
    return String(row.value) !== '0';
  } catch {
    return true;
  }
}

function setGlobalEnabled(enabled) {
  const database = getDb();
  const value = enabled ? '1' : '0';
  database.prepare(`
    INSERT INTO bot_global_config (key, value) VALUES ('global_enabled', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(value);
  return isGlobalEnabled();
}

/**
 * LEFT JOIN lógico entre chats (messages.db) y chat_permissions.
 * No usa ATTACH para evitar bloqueos WAL: lee ambas fuentes y mezcla en JS.
 * Ordenado por actividad reciente (last_message_time DESC).
 */
function getAllChatsWithPermissions(opts = {}) {
  const messagesDbPath = opts.messagesDbPath || process.env.MESSAGES_DB_PATH || DB_PATHS.MESSAGES;
  let chats = [];
  try {
    const mdb = new DatabaseSync(messagesDbPath, { readOnly: true });
    try {
      chats = mdb.prepare(
        'SELECT jid, name, last_message_time FROM chats ORDER BY last_message_time DESC LIMIT 2000'
      ).all();
    } finally {
      try { mdb.close(); } catch {}
    }
  } catch (err) {
    // Si messages.db está bloqueada o no existe, devolver al menos los permisos guardados
    try {
      const database = getDb();
      const rows = database.prepare('SELECT * FROM chat_permissions ORDER BY updated_at DESC LIMIT 500').all();
      return rows.map((r) => ({
        jid: r.chat_jid,
        name: r.chat_name || r.chat_jid,
        last_message_time: null,
        is_group: String(r.chat_jid || '').endsWith('@g.us'),
        is_marketplace: isMarketplaceChat(r.chat_jid, r.chat_name || ''),
        ...toPermissionObject(r, r.chat_jid, r.chat_name || '')
      }));
    } catch {
      return [];
    }
  }

  // Mapa de permisos para mezcla O(1)
  let permMap = new Map();
  try {
    const database = getDb();
    const rows = database.prepare('SELECT * FROM chat_permissions').all();
    for (const r of rows) permMap.set(r.chat_jid, r);
  } catch {}

  return chats
    .filter((c) => c && c.jid && c.jid !== 'status@broadcast' && !String(c.jid).endsWith('@newsletter'))
    .map((c) => {
      const perm = toPermissionObject(permMap.get(c.jid) || null, c.jid, c.name || '');
      // Refrescar nombre visible si la BD de permisos tiene un nombre viejo
      const displayName = c.name || perm.chat_name || c.jid;
      return {
        jid: c.jid,
        name: displayName,
        last_message_time: c.last_message_time || null,
        is_group: String(c.jid).endsWith('@g.us'),
        is_marketplace: isMarketplaceChat(c.jid, c.name || ''),
        chat_jid: c.jid,
        chat_name: displayName,
        autonomy_mode: perm.autonomy_mode,
        allow_notion: perm.allow_notion,
        allow_media: perm.allow_media,
        updated_at: perm.updated_at,
        is_custom: perm.is_custom
      };
    });
}

/** Cierra la sesión en memoria/SQLite (IDLE + limpia ambient_buffer). */
function resetChatSession(chatJid) {
  try {
    const sessionManager = require('../../session-manager.js');
    sessionManager.closeSession(chatJid);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  AUTONOMY_MODES,
  getDbPath,
  getChatPermission,
  setChatPermission,
  isGlobalEnabled,
  setGlobalEnabled,
  getAllChatsWithPermissions,
  resetChatSession,
  defaultAutonomyMode,
  _setDbPath,
  _closeDb
};
