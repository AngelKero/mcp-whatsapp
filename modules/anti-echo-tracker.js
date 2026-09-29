/**
 * modules/anti-echo-tracker.js
 * Rastreador de firmas anti-eco compartido y persistente en SQLite.
 *
 * Evita que el bot o cualquier script satélite (daily-briefing, classroom-sync, recordatorios)
 * genere respuestas a sus propios mensajes en chats propios (is_from_me = 1).
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'store', 'anti-echo.db');

class AntiEchoTracker {
  constructor(ttlMs = 15 * 60 * 1000) {
    this.ttlMs = ttlMs;
    this.sentIdsTtlMs = 7 * 24 * 60 * 60 * 1000; // 7 días en caliente; lo viejo va por fallback a messages.db
    this.historyDb = null; // handle read-only perezoso a messages.db (fallback wake)
    this.memoryFallback = new Map();
    this.sentIdsCache = new Set();
    this.db = null;
    this.initDb();
  }

  initDb() {
    try {
      const storeDir = path.dirname(DB_PATH);
      if (!fs.existsSync(storeDir)) {
        fs.mkdirSync(storeDir, { recursive: true });
      }
      this.db = new DatabaseSync(DB_PATH);
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS anti_echo_signatures (
          sig TEXT PRIMARY KEY,
          pfx TEXT,
          timestamp INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_anti_echo_pfx ON anti_echo_signatures(pfx);
        CREATE INDEX IF NOT EXISTS idx_anti_echo_time ON anti_echo_signatures(timestamp);

        CREATE TABLE IF NOT EXISTS sent_messages (
          id TEXT PRIMARY KEY,
          chat_jid TEXT,
          text_sig TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sent_msg_time ON sent_messages(created_at);
      `);

      // Cargar IDs recientes en caché en memoria
      try {
        const rows = this.db.prepare(
          'SELECT id FROM sent_messages ORDER BY created_at DESC LIMIT 1000'
        ).all();
        if (rows) {
          for (const r of rows) {
            if (r.id) this.sentIdsCache.add(r.id);
          }
        }
      } catch {}
    } catch (e) {
      console.warn('[ANTI ECHO] Usando fallback en memoria (error abriendo SQLite):', e.message);
      this.db = null;
    }
  }

  static computeSignature(text) {
    if (!text) return null;
    const normalized = text
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (!normalized) return null;

    let hash = 2166136261;
    for (let i = 0; i < normalized.length; i++) {
      hash ^= normalized.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${normalized.length}:${(hash >>> 0).toString(36)}`;
  }

  static computePrefixSignature(text) {
    if (!text) return null;
    const normalized = text
      .replace(/\r\n/g, '\n')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (normalized.length < 40) return null;
    const prefix = normalized.slice(0, 40);
    let hash = 2166136261;
    for (let i = 0; i < prefix.length; i++) {
      hash ^= prefix.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `pfx:${(hash >>> 0).toString(36)}`;
  }

  recordSentMessage(id, chatJid = '', text = '') {
    if (!id) return;
    const cleanId = String(id).trim();
    if (!cleanId) return;
    const now = Date.now();
    const sig = text ? AntiEchoTracker.computeSignature(text) : null;

    this.sentIdsCache.add(cleanId);
    if (this.sentIdsCache.size > 5000) {
      // Purgar entradas antiguas de la caché en memoria si crece demasiado
      const it = this.sentIdsCache.values();
      for (let i = 0; i < 1000; i++) this.sentIdsCache.delete(it.next().value);
    }

    if (this.db) {
      try {
        const stmt = this.db.prepare(
          'INSERT OR REPLACE INTO sent_messages (id, chat_jid, text_sig, created_at) VALUES (?, ?, ?, ?)'
        );
        stmt.run(cleanId, chatJid || '', sig || '', now);
      } catch (e) {
        console.error('[ANTI ECHO] Error guardando ID de mensaje saliente en DB:', e.message);
      }
    }

    if (text) {
      this.remember(text);
    }
  }

  /**
   * Handle read-only perezoso al historial propio. Se abre al primer fallback
   * miss y se reutiliza; si no abre, devuelve null (fail-open).
   */
  getHistoryDb() {
    if (this.historyDb !== null) return this.historyDb;
    try {
      let p = process.env.MESSAGES_DB_PATH || null;
      if (!p) {
        try {
          // eslint-disable-next-line global-require
          p = require('../config/env.js').DB_PATHS.MESSAGES;
        } catch {
          p = path.join(__dirname, '..', 'store', 'messages.db');
        }
      }
      this.historyDb = new DatabaseSync(p, { readOnly: true });
    } catch {
      this.historyDb = false;
    }
    return this.historyDb || null;
  }

  /** Solo tests: redirige el historial a una BD temporal. */
  _setHistoryDbPathForTests(p) {
    try { if (this.historyDb) this.historyDb.close(); } catch {}
    this.historyDb = null;
    if (p) {
      process.env.MESSAGES_DB_PATH = p;
    } else {
      delete process.env.MESSAGES_DB_PATH;
    }
  }

  hasSentId(id) {
    if (!id) return false;
    const cleanId = String(id).trim();
    if (!cleanId) return false;

    if (this.sentIdsCache.has(cleanId)) {
      return true;
    }

    if (this.db) {
      try {
        const row = this.db.prepare('SELECT 1 FROM sent_messages WHERE id = ? LIMIT 1').get(cleanId);
        if (row) {
          this.sentIdsCache.add(cleanId);
          return true;
        }
      } catch (e) {
        console.error('[ANTI ECHO] Error verificando sent_messages en DB:', e.message);
      }
    }

    // Fallback en frío (spec quote-wake-retention): el ID pudo purgarse de
    // sent_messages; el historial propio no se purga. Sin warming de caché.
    try {
      const hdb = this.getHistoryDb();
      if (hdb) {
        const hit = hdb.prepare(
          'SELECT 1 FROM messages WHERE id = ? AND is_from_me = 1 LIMIT 1'
        ).get(cleanId);
        if (hit) return true;
      }
    } catch {}

    return false;
  }

  getRecentSentIds(limit = 500) {
    if (!this.db) return Array.from(this.sentIdsCache).slice(-limit);
    try {
      const rows = this.db.prepare(
        'SELECT id FROM sent_messages ORDER BY created_at DESC LIMIT ?'
      ).all(limit);
      return (rows || []).map(r => r.id);
    } catch {
      return Array.from(this.sentIdsCache).slice(-limit);
    }
  }

  remember(text) {
    const sig = AntiEchoTracker.computeSignature(text);
    if (!sig) return;
    const pfx = AntiEchoTracker.computePrefixSignature(text);
    const now = Date.now();

    if (this.db) {
      try {
        const stmt = this.db.prepare('INSERT OR REPLACE INTO anti_echo_signatures (sig, pfx, timestamp) VALUES (?, ?, ?)');
        stmt.run(sig, pfx, now);
        this.evict(now);
        return;
      } catch (e) {
        console.error('[ANTI ECHO] Error guardando firma en DB:', e.message);
      }
    }
    this.memoryFallback.set(sig, { pfx, timestamp: now });
  }

  consume(text) {
    const sig = AntiEchoTracker.computeSignature(text);
    if (!sig) return false;
    const pfx = AntiEchoTracker.computePrefixSignature(text);
    const now = Date.now();

    if (this.db) {
      try {
        this.evict(now);
        // Buscar coincidencia exacta por sig, o por pfx para textos largos
        let row = null;
        if (pfx) {
          row = this.db.prepare('SELECT sig, timestamp FROM anti_echo_signatures WHERE sig = ? OR pfx = ? LIMIT 1').get(sig, pfx);
        } else {
          row = this.db.prepare('SELECT sig, timestamp FROM anti_echo_signatures WHERE sig = ? LIMIT 1').get(sig);
        }

        if (row) {
          // Mantener la firma viva durante su TTL completo para proteger contra re-lecturas o reinicios
          return (now - row.timestamp) <= this.ttlMs;
        }
        return false;
      } catch (e) {
        console.error('[ANTI ECHO] Error verificando firma en DB:', e.message);
      }
    }

    // Fallback en memoria
    if (this.memoryFallback.has(sig)) {
      const entry = this.memoryFallback.get(sig);
      return (now - entry.timestamp) <= this.ttlMs;
    }
    if (pfx) {
      for (const [, entry] of this.memoryFallback.entries()) {
        if (entry.pfx === pfx) {
          return (now - entry.timestamp) <= this.ttlMs;
        }
      }
    }
    return false;
  }

  rememberSticker(hashOrId) {
    if (!hashOrId) return;
    const clean = String(hashOrId).toLowerCase().trim();
    const sig = `sticker:${clean}`;
    const now = Date.now();

    if (this.db) {
      try {
        const stmt = this.db.prepare('INSERT OR REPLACE INTO anti_echo_signatures (sig, pfx, timestamp) VALUES (?, ?, ?)');
        stmt.run(sig, 'sticker', now);
        this.evict(now);
        return;
      } catch (e) {
        console.error('[ANTI ECHO] Error guardando firma de sticker:', e.message);
      }
    }
    this.memoryFallback.set(sig, { pfx: 'sticker', timestamp: now });
  }

  consumeSticker(hashOrId) {
    if (!hashOrId) return false;
    const clean = String(hashOrId).toLowerCase().trim();

    // Verificación 1: ID en sent_messages
    if (this.hasSentId(clean) || this.hasSentId(hashOrId)) {
      return true;
    }

    // Verificación 2: Firma de sticker registrada
    const sig = `sticker:${clean}`;
    const now = Date.now();

    if (this.db) {
      try {
        this.evict(now);
        const row = this.db.prepare('SELECT sig, timestamp FROM anti_echo_signatures WHERE sig = ? LIMIT 1').get(sig);
        if (row) {
          return (now - row.timestamp) <= this.ttlMs;
        }
        return false;
      } catch (e) {
        console.error('[ANTI ECHO] Error verificando firma de sticker:', e.message);
      }
    }

    if (this.memoryFallback.has(sig)) {
      const entry = this.memoryFallback.get(sig);
      return (now - entry.timestamp) <= this.ttlMs;
    }
    return false;
  }

  evict(now) {
    if (this.db) {
      try {
        this.db.prepare('DELETE FROM anti_echo_signatures WHERE ? - timestamp > ?').run(now, this.ttlMs);
        this.db.prepare('DELETE FROM sent_messages WHERE ? - created_at > ?').run(now, this.sentIdsTtlMs);
      } catch {}
    }
  }
}

const sharedTracker = new AntiEchoTracker();

module.exports = sharedTracker;
module.exports.AntiEchoTracker = AntiEchoTracker;
