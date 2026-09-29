/**
 * pipeline/memory-store.js
 * Memoria factual persistente por chat (chat-memory).
 *
 * Vive en store/messages.db (mismas tablas que lee el watcher) con 3 tablas
 * propias creadas IF NOT EXISTS — sin tocar messages/chats/messages_fts.
 * Clave canónica por persona: dm:<digitos> en 1:1, grp:<grupo>:<emisor> en grupos,
 * de modo que @lid y @s.whatsapp.net con los mismos dígitos comparten memoria.
 *
 * Fail-open: cualquier error de SQLite devuelve vacíos, nunca lanza hacia el pipeline.
 */
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const VALID_CATEGORIES = ['profile', 'preference', 'commitment', 'fact'];
const VALID_SCOPES = ['self', 'group', 'global'];

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS memory_facts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mem_key TEXT NOT NULL,
    fact_key TEXT NOT NULL,
    value TEXT NOT NULL,
    category TEXT DEFAULT 'fact',
    scope TEXT DEFAULT 'self',
    source_msg_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS memory_facts_source_uidx
    ON memory_facts(source_msg_id, fact_key)
    WHERE source_msg_id IS NOT NULL AND deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS memory_facts_key_idx
    ON memory_facts(mem_key, updated_at DESC)
    WHERE deleted_at IS NULL;
  CREATE TABLE IF NOT EXISTS memory_settings (
    mem_key TEXT PRIMARY KEY,
    chat_jid TEXT,
    enabled INTEGER DEFAULT 0,
    ttl_days INTEGER,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS memory_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mem_key TEXT NOT NULL,
    action TEXT NOT NULL,
    before_text TEXT,
    after_text TEXT,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

function ensureSchema(db) {
  db.exec(SCHEMA_SQL);
}

/** Extrae solo dígitos de la parte usuario de un JID. */
function digitsOf(jid) {
  if (!jid) return '';
  const user = String(jid).split('@')[0] || '';
  return user.replace(/\D/g, '');
}

/**
 * Clave canónica de memoria para (chatJid, senderJid).
 * - 1:1 -> "dm:<digitos>" (resuelve el fork @lid vs @s.whatsapp.net)
 * - grupo -> "grp:<digitos-grupo>:<digitos-emisor>" (per-channel-peer)
 * Devuelve null si no hay dígitos (p.ej. status@broadcast).
 */
function memoryKeyFor(chatJid, senderJid) {
  const chat = String(chatJid || '').toLowerCase().trim();
  if (!chat || chat === 'status@broadcast' || chat.endsWith('@newsletter')) return null;
  const chatDigits = digitsOf(chat);
  if (!chatDigits) return null;
  if (chat.endsWith('@g.us')) {
    const senderDigits = digitsOf(senderJid);
    if (!senderDigits) return null;
    return `grp:${chatDigits}:${senderDigits}`;
  }
  return `dm:${chatDigits}`;
}

/** Prefijo para listar todos los hechos de un chat grupal. */
function groupKeyPrefix(chatJid) {
  const chatDigits = digitsOf(chatJid);
  if (!chatDigits) return null;
  return `grp:${chatDigits}:`;
}

function normalizeCategory(c) {
  const v = String(c || 'fact').toLowerCase().trim();
  return VALID_CATEGORIES.includes(v) ? v : 'fact';
}

function normalizeScope(s) {
  const v = String(s || 'self').toLowerCase().trim();
  return VALID_SCOPES.includes(v) ? v : 'self';
}

class ChatMemoryStore {
  constructor(db) {
    this.db = db;
    this._writeChain = Promise.resolve();
    try {
      this.db.exec('PRAGMA busy_timeout = 5000');
    } catch {}
    ensureSchema(this.db);
  }

  /** Serializa escrituras para no apilar SQLITE_BUSY entre hilos lógicos. */
  _serialize(fn) {
    const run = this._writeChain.then(() => fn()).catch((err) => {
      console.error('[CHAT-MEMORY] Error de escritura:', err.message);
      return null;
    });
    this._writeChain = run.catch(() => {});
    return run;
  }

  // ---- settings ----

  isEnabled(memKey) {
    if (!memKey) return false;
    try {
      const row = this.db.prepare('SELECT enabled FROM memory_settings WHERE mem_key = ?').get(memKey);
      if (!row) return false; // opt-in: sin fila = deshabilitado
      return row.enabled === 1;
    } catch {
      return false;
    }
  }

  getSettings(memKey) {
    try {
      const row = this.db.prepare('SELECT * FROM memory_settings WHERE mem_key = ?').get(memKey);
      if (!row) return { mem_key: memKey, enabled: false, ttl_days: null };
      return { mem_key: row.mem_key, enabled: row.enabled === 1, ttl_days: row.ttl_days ?? null };
    } catch {
      return { mem_key: memKey, enabled: false, ttl_days: null };
    }
  }

  setEnabled(memKey, chatJid, enabled) {
    return this._serialize(() => {
      this.db.prepare(`
        INSERT INTO memory_settings (mem_key, chat_jid, enabled, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(mem_key) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP
      `).run(memKey, chatJid || null, enabled ? 1 : 0);
      this.logEvent(memKey, enabled ? 'enable' : 'disable', null, null, 'panel o comando');
      return this.getSettings(memKey);
    });
  }

  setTtl(memKey, chatJid, ttlDays) {
    const v = ttlDays === null || ttlDays === undefined ? null : parseInt(ttlDays, 10);
    if (v !== null && (!Number.isFinite(v) || v <= 0)) {
      throw new RangeError(`ttl_days inválido: ${ttlDays}. Usa un entero positivo o null.`);
    }
    return this._serialize(() => {
      this.db.prepare(`
        INSERT INTO memory_settings (mem_key, chat_jid, ttl_days, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(mem_key) DO UPDATE SET ttl_days = excluded.ttl_days, updated_at = CURRENT_TIMESTAMP
      `).run(memKey, chatJid || null, v);
      return this.getSettings(memKey);
    });
  }

  // ---- facts ----

  /**
   * Guarda un hecho. Si ya existe un hecho vivo con (mem_key, fact_key),
   * actualiza valor+timestamp (gana lo más reciente) en vez de duplicar.
   */
  saveFact({ memKey, key, value, category = 'fact', scope = 'self', sourceMsgId = null }) {
    return this._serialize(() => {
      const factKey = String(key || '').slice(0, 60).trim();
      const val = String(value || '').slice(0, 280).trim();
      if (!memKey || !factKey || !val) return null;
      const cat = normalizeCategory(category);
      const scp = normalizeScope(scope);
      const existing = this.db.prepare(
        'SELECT * FROM memory_facts WHERE mem_key = ? AND fact_key = ? AND deleted_at IS NULL LIMIT 1'
      ).get(memKey, factKey);
      if (existing) {
        if (existing.value === val) return { action: 'ignored-duplicate', fact: existing };
        const before = `${existing.fact_key}: ${existing.value}`;
        this.db.prepare(
          'UPDATE memory_facts SET value = ?, category = ?, scope = ?, source_msg_id = COALESCE(?, source_msg_id), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).run(val, cat, scp, sourceMsgId, existing.id);
        const after = `${factKey}: ${val}`;
        this.logEvent(memKey, 'update', before, after, 'nuevo valor gana');
        return { action: 'updated', fact: { ...existing, value: val, category: cat } };
      }
      try {
        const res = this.db.prepare(`
          INSERT INTO memory_facts (mem_key, fact_key, value, category, scope, source_msg_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(memKey, factKey, val, cat, scp, sourceMsgId);
        this.logEvent(memKey, 'save', null, `${factKey}: ${val}`, sourceMsgId ? `msg ${sourceMsgId}` : 'comando');
        return { action: 'saved', fact: { id: Number(res.lastInsertRowid), mem_key: memKey, fact_key: factKey, value: val, category: cat } };
      } catch (err) {
        // Carrera de dedupe por source_msg_id (UNIQUE parcial): idempotente, no es error.
        if (String(err.message || '').includes('UNIQUE')) return { action: 'ignored-duplicate', fact: null };
        throw err;
      }
    });
  }

  getFacts(memKey, { limit = 50 } = {}) {
    try {
      return this.db.prepare(`
        SELECT id, mem_key, fact_key, value, category, scope, source_msg_id, created_at, updated_at
        FROM memory_facts WHERE mem_key = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT ?
      `).all(memKey, Math.min(limit, 200));
    } catch {
      return [];
    }
  }

  /** Hechos de todo un grupo (cualquier emisor). */
  getGroupFacts(chatJid, { limit = 50 } = {}) {
    const prefix = groupKeyPrefix(chatJid);
    if (!prefix) return [];
    try {
      return this.db.prepare(`
        SELECT id, mem_key, fact_key, value, category, scope, source_msg_id, created_at, updated_at
        FROM memory_facts WHERE mem_key LIKE ? AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT ?
      `).all(`${prefix}%`, Math.min(limit, 200));
    } catch {
      return [];
    }
  }

  countFacts(memKey) {
    try {
      const row = this.db.prepare(
        'SELECT COUNT(*) AS n FROM memory_facts WHERE mem_key = ? AND deleted_at IS NULL'
      ).get(memKey);
      return row?.n || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Búsqueda por keywords (v1 sin embeddings): puntúa ocurrencias en key+value,
   * desempata por recencia. Sanitiza a alfanumérico para no romper LIKE.
   */
  searchFacts(memKey, query, limit = 8) {
    try {
      const tokens = String(query || '').toLowerCase().split(/[^a-z0-9áéíóúñü]+/i).filter((t) => t.length > 1).slice(0, 6);
      const facts = this.getFacts(memKey, { limit: 100 });
      if (tokens.length === 0) return facts.slice(0, limit);
      const scored = facts.map((f) => {
        const hay = `${f.fact_key} ${f.value}`.toLowerCase();
        let score = 0;
        for (const t of tokens) {
          let i = -1;
          while ((i = hay.indexOf(t, i + 1)) !== -1) score += t.length > 4 ? 2 : 1;
        }
        return { f, score };
      }).filter((s) => s.score > 0);
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit).map((s) => s.f);
    } catch {
      return [];
    }
  }

  updateFact(id, { key, value, category }) {
    return this._serialize(() => {
      const row = this.db.prepare('SELECT * FROM memory_facts WHERE id = ? AND deleted_at IS NULL').get(id);
      if (!row) return null;
      const before = `${row.fact_key}: ${row.value}`;
      const nextKey = key !== undefined ? String(key).slice(0, 60).trim() || row.fact_key : row.fact_key;
      const nextVal = value !== undefined ? String(value).slice(0, 280).trim() || row.value : row.value;
      const nextCat = category !== undefined ? normalizeCategory(category) : row.category;
      this.db.prepare(
        'UPDATE memory_facts SET fact_key = ?, value = ?, category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(nextKey, nextVal, nextCat, id);
      this.logEvent(row.mem_key, 'edit', before, `${nextKey}: ${nextVal}`, 'panel');
      return { id, fact_key: nextKey, value: nextVal, category: nextCat };
    });
  }

  deleteFact(id) {
    return this._serialize(() => {
      const row = this.db.prepare('SELECT * FROM memory_facts WHERE id = ? AND deleted_at IS NULL').get(id);
      if (!row) return null;
      this.db.prepare('UPDATE memory_facts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
      this.logEvent(row.mem_key, 'delete', `${row.fact_key}: ${row.value}`, null, 'comando o panel');
      return row;
    });
  }

  clearFacts(memKey) {
    return this._serialize(() => {
      const rows = this.getFacts(memKey, { limit: 500 });
      this.db.prepare('UPDATE memory_facts SET deleted_at = CURRENT_TIMESTAMP WHERE mem_key = ? AND deleted_at IS NULL').run(memKey);
      this.logEvent(memKey, 'clear', `${rows.length} hechos`, null, 'olvido total confirmado');
      return rows.length;
    });
  }

  // ---- events ----

  logEvent(memKey, action, beforeText, afterText, reason) {
    try {
      this.db.prepare(
        'INSERT INTO memory_events (mem_key, action, before_text, after_text, reason) VALUES (?, ?, ?, ?, ?)'
      ).run(memKey, action, beforeText, afterText, reason || null);
    } catch {}
  }

  getEvents(memKey, limit = 20) {
    try {
      return this.db.prepare(
        'SELECT * FROM memory_events WHERE mem_key = ? ORDER BY id DESC LIMIT ?'
      ).all(memKey, Math.min(limit, 100));
    } catch {
      return [];
    }
  }

  // ---- nivel chat (grupos: fallback a setting chat-level grp:<digitos>) ----

  chatLevelKey(chatJid) {
    const chat = String(chatJid || '').toLowerCase().trim();
    if (!chat.endsWith('@g.us')) return null;
    const d = digitsOf(chat);
    return d ? `grp:${d}` : null;
  }

  isEnabledFor(chatJid, senderJid) {
    try {
      const memKey = memoryKeyFor(chatJid, senderJid);
      if (memKey && this.isEnabled(memKey)) return true;
      const chatKey = this.chatLevelKey(chatJid);
      if (chatKey) {
        const row = this.db.prepare('SELECT enabled FROM memory_settings WHERE mem_key = ?').get(chatKey);
        if (row) return row.enabled === 1;
      }
      return false;
    } catch {
      return false;
    }
  }

  /** Activa/desactiva a nivel chat (grupos: default para emisores futuros + existentes). */
  setChatEnabled(chatJid, senderJid, enabled) {
    return this._serialize(() => {
      const on = !!enabled;
      const touched = [];
      const memKey = memoryKeyFor(chatJid, senderJid);
      if (memKey) {
        this.db.prepare(`
          INSERT INTO memory_settings (mem_key, chat_jid, enabled, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(mem_key) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP
        `).run(memKey, chatJid || null, on ? 1 : 0);
        touched.push(memKey);
      }
      const chatKey = this.chatLevelKey(chatJid);
      if (chatKey) {
        this.db.prepare(`
          INSERT INTO memory_settings (mem_key, chat_jid, enabled, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(mem_key) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP
        `).run(chatKey, chatJid || null, on ? 1 : 0);
        if (on) {
          // Propaga a emisores ya conocidos del grupo.
          try {
            const rows = this.db.prepare('SELECT DISTINCT mem_key FROM memory_facts WHERE mem_key LIKE ?').all(`${chatKey}:%`);
            for (const r of rows) {
              this.db.prepare(`
                INSERT INTO memory_settings (mem_key, chat_jid, enabled, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(mem_key) DO UPDATE SET enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP
              `).run(r.mem_key, chatJid || null, 1);
              touched.push(r.mem_key);
            }
          } catch {}
        }
        touched.push(chatKey);
      }
      for (const k of touched) this.logEvent(k, on ? 'enable' : 'disable', null, null, 'panel');
      return { enabled: on, keys: touched };
    });
  }

  clearChatFacts(chatJid) {
    return this._serialize(() => {
      const chat = String(chatJid || '');
      let total = 0;
      if (chat.toLowerCase().trim().endsWith('@g.us')) {
        const prefix = groupKeyPrefix(chat);
        if (!prefix) return 0;
        const rows = this.db.prepare(
          'SELECT DISTINCT mem_key FROM memory_facts WHERE mem_key LIKE ? AND deleted_at IS NULL'
        ).all(`${prefix}%`);
        for (const r of rows) {
          this.db.prepare('UPDATE memory_facts SET deleted_at = CURRENT_TIMESTAMP WHERE mem_key = ? AND deleted_at IS NULL').run(r.mem_key);
          this.logEvent(r.mem_key, 'clear', 'borrado total (panel)', null, 'panel');
          total += 1;
        }
        // Cuenta hechos, no keys, para el mensaje de confirmación.
        try {
          const c = this.db.prepare('SELECT COUNT(*) AS n FROM memory_facts WHERE mem_key LIKE ?').all(`${prefix}%`);
          void c;
        } catch {}
        return total;
      }
      const memKey = memoryKeyFor(chat, chat);
      if (!memKey) return 0;
      const rows = this.getFacts(memKey, { limit: 500 });
      this.db.prepare('UPDATE memory_facts SET deleted_at = CURRENT_TIMESTAMP WHERE mem_key = ? AND deleted_at IS NULL').run(memKey);
      this.logEvent(memKey, 'clear', `${rows.length} hechos`, null, 'panel');
      return rows.length;
    });
  }

  /**
   * Contexto de turno resuelto a nivel chat (respeta fallback grupal).
   * Es lo que usan el watcher y el panel para inyectar.
   */
  getTurnContextFor(chatJid, senderJid, message, opts = {}) {
    try {
      if (!this.isEnabledFor(chatJid, senderJid)) return '';
      const memKey = memoryKeyFor(chatJid, senderJid);
      if (!memKey) return '';
      return this.getTurnContext(memKey, message, opts);
    } catch {
      return '';
    }
  }

  // ---- inyección pre-turno ----

  /**
   * Bloque de contexto para el prompt. '' si deshabilitado o sin hechos.
   * Presupuesto: perfil compacto siempre + hasta maxFacts tópicos.
   */
  getTurnContext(memKey, message, { maxFacts = 8, maxChars = 1500 } = {}) {
    try {
      if (!memKey || !this.isEnabled(memKey)) return '';
      const facts = this.searchFacts(memKey, message, maxFacts);
      if (facts.length === 0) return '';
      const lines = facts.map((f) => `- ${f.fact_key}: ${f.value}`);
      let block = `<memoria>\n${lines.join('\n')}\n</memoria>`;
      if (block.length > maxChars) {
        // Recorta por los menos relevantes (el search ya ordena por score).
        const kept = [];
        let len = '<memoria>\n</memoria>'.length;
        for (const f of facts) {
          const line = `- ${f.fact_key}: ${f.value}\n`;
          if (len + line.length > maxChars) break;
          kept.push(`- ${f.fact_key}: ${f.value}`);
          len += line.length;
        }
        if (kept.length === 0) return '';
        block = `<memoria>\n${kept.join('\n')}\n</memoria>`;
      }
      return block;
    } catch {
      return '';
    }
  }

  /** Resumen agregado para el panel: settings + conteo por mem_key. */
  getMemoryOverview() {
    try {
      const settings = this.db.prepare('SELECT mem_key, enabled FROM memory_settings').all();
      const counts = this.db.prepare(
        'SELECT mem_key, COUNT(*) AS n FROM memory_facts WHERE deleted_at IS NULL GROUP BY mem_key'
      ).all();
      const countMap = new Map(counts.map((c) => [c.mem_key, c.n]));
      const settingsMap = new Map(settings.map((s) => [s.mem_key, s.enabled === 1]));
      return { settingsMap, countMap };
    } catch {
      return { settingsMap: new Map(), countMap: new Map() };
    }
  }

  close() {
    try { this.db.close(); } catch {}
  }
}

// ---- singleton de producción (messages.db en lectura-escritura) ----

let singletonPath = process.env.MEMORY_DB_PATH || null;
let singleton = null;

function defaultDbPath() {
  try {
    // eslint-disable-next-line global-require
    const { DB_PATHS } = require('../config/env.js');
    return DB_PATHS.MESSAGES;
  } catch {
    return path.join(__dirname, '..', 'store', 'messages.db');
  }
}

function getDbPath() {
  return singletonPath || process.env.MEMORY_DB_PATH || defaultDbPath();
}

/** Solo tests: redirige el singleton a un archivo temporal. */
function _setDbPath(p) {
  try { if (singleton) singleton.close(); } catch {}
  singleton = null;
  singletonPath = p;
}

function _resetForTests() {
  try { if (singleton) singleton.close(); } catch {}
  singleton = null;
  singletonPath = null;
}

function getMemoryStore() {
  if (singleton) return singleton;
  const p = getDbPath();
  try {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch {}
  const db = new DatabaseSync(p);
  singleton = new ChatMemoryStore(db);
  return singleton;
}

module.exports = {
  ChatMemoryStore,
  ensureSchema,
  memoryKeyFor,
  groupKeyPrefix,
  digitsOf,
  normalizeCategory,
  normalizeScope,
  VALID_CATEGORIES,
  VALID_SCOPES,
  getMemoryStore,
  getDbPath,
  _setDbPath,
  _resetForTests
};
