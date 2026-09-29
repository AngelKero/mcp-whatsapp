/**
 * modules/stickers/sticker-vault.js
 * Almacén persistente e indexador semántico híbrido para Stickers de WhatsApp.
 * Base de datos: store/sticker-vault.db (SQLite WAL + FTS5)
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'store', 'sticker-vault.db');
const VAULT_DIR = path.join(__dirname, '..', '..', 'store', 'stickers', 'vault');
const PREVIEW_DIR = path.join(__dirname, '..', '..', 'store', 'stickers', 'preview');

class StickerVault {
  constructor() {
    this.db = null;
    this.initDb();
  }

  initDb() {
    try {
      const storeDir = path.dirname(DB_PATH);
      if (!fs.existsSync(storeDir)) fs.mkdirSync(storeDir, { recursive: true });
      if (!fs.existsSync(VAULT_DIR)) fs.mkdirSync(VAULT_DIR, { recursive: true });

      this.db = new DatabaseSync(DB_PATH);
      this.db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;

        CREATE TABLE IF NOT EXISTS stickers (
          id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          source TEXT NOT NULL,
          sender_jid TEXT,
          pack_name TEXT,
          meme_name TEXT,
          visual_description TEXT,
          emotion TEXT,
          intent TEXT,
          ocr_text TEXT,
          tags TEXT,
          emojis TEXT,
          suggested_contexts TEXT,
          use_count INTEGER DEFAULT 0,
          last_used_timestamp INTEGER,
          created_at INTEGER NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS stickers_fts USING fts5(
          id UNINDEXED,
          meme_name,
          visual_description,
          emotion,
          intent,
          ocr_text,
          tags,
          emojis,
          suggested_contexts
        );

        CREATE INDEX IF NOT EXISTS idx_stickers_source ON stickers(source);
        CREATE INDEX IF NOT EXISTS idx_stickers_use_count ON stickers(use_count);
      `);
    } catch (err) {
      console.error('[STICKER VAULT] Error inicializando DB:', err.message);
    }
  }

  hasSticker(id) {
    if (!this.db || !id) return false;
    try {
      const row = this.db.prepare('SELECT 1 FROM stickers WHERE id = ?').get(id);
      return !!row;
    } catch {
      return false;
    }
  }

  getById(id) {
    if (!this.db || !id) return null;
    try {
      return this.db.prepare('SELECT * FROM stickers WHERE id = ?').get(id) || null;
    } catch (err) {
      console.error('[STICKER VAULT] Error consultando sticker:', err.message);
      return null;
    }
  }

  saveSticker(profile) {
    if (!this.db || !profile || !profile.id) return false;
    const now = Date.now();
    const source = profile.source || 'inbound_live';
    const filePath = profile.file_path || '';
    const senderJid = profile.sender_jid || '';
    const packName = profile.pack_name || '';
    const memeName = profile.meme_name || 'Sticker';
    const visualDesc = profile.visual_description || '';

    // Filtro de exclusión / blacklist
    if (packName.toLowerCase().includes('cuppy') || memeName.toLowerCase().includes('cuppy')) {
      return false;
    }
    const emotion = profile.emotion || '';
    const intent = Array.isArray(profile.intent) ? profile.intent.join(', ') : (profile.intent || '');
    const ocrText = profile.ocr_text || '';
    const tags = Array.isArray(profile.tags) ? profile.tags.join(', ') : (profile.tags || '');
    const emojis = Array.isArray(profile.emojis) ? profile.emojis.join(' ') : (profile.emojis || '');
    const contexts = profile.suggested_contexts || '';

    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO stickers (
          id, file_path, source, sender_jid, pack_name,
          meme_name, visual_description, emotion, intent,
          ocr_text, tags, emojis, suggested_contexts,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        profile.id, filePath, source, senderJid, packName,
        memeName, visualDesc, emotion, intent,
        ocrText, tags, emojis, contexts,
        now
      );

      // Actualizar índice FTS5
      this.db.prepare('DELETE FROM stickers_fts WHERE id = ?').run(profile.id);
      this.db.prepare(`
        INSERT INTO stickers_fts (
          id, meme_name, visual_description, emotion,
          intent, ocr_text, tags, emojis, suggested_contexts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        profile.id, memeName, visualDesc, emotion,
        intent, ocrText, tags, emojis, contexts
      );

      // Mantener symlink con nombre humano amigable en preview
      try {
        if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });
        const cleanName = (memeName || 'sticker')
          .replace(/[\/\\:*?"<>|]/g, '_')
          .replace(/\s+/g, ' ')
          .trim();
        const linkPath = path.join(PREVIEW_DIR, `${cleanName}.webp`);
        if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath);
        fs.symlinkSync(filePath, linkPath);
      } catch {}

      return true;
    } catch (err) {
      console.error('[STICKER VAULT] Error guardando sticker:', err.message);
      return false;
    }
  }

  searchHybrid(query, limit = 5) {
    if (!this.db || !query || !query.trim()) return [];
    const cleanTokens = query
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(t => t.length > 1);

    const results = [];
    const seenIds = new Set();

    // 1. Búsqueda FTS5 (Texto Completo)
    if (cleanTokens.length > 0) {
      try {
        const ftsQuery = cleanTokens.map(t => `"${t}"*`).join(' OR ');
        const rows = this.db.prepare(`
          SELECT s.*, fts.rank
          FROM stickers_fts fts
          JOIN stickers s ON s.id = fts.id
          WHERE stickers_fts MATCH ?
          ORDER BY rank ASC
          LIMIT ?
        `).all(ftsQuery, limit);

        for (const row of rows) {
          if (fs.existsSync(row.file_path)) {
            results.push(row);
            seenIds.add(row.id);
          }
        }
      } catch (err) {
        // En caso de sintaxis FTS5 inválida, continuar con fallback LIKE
      }
    }

    // 2. Fallback / Complemento con LIKE y Emojis
    if (results.length < limit) {
      try {
        const remaining = limit - results.length;
        const likePattern = `%${query.trim().slice(0, 30)}%`;
        const likeRows = this.db.prepare(`
          SELECT * FROM stickers
          WHERE (emotion LIKE ? OR tags LIKE ? OR meme_name LIKE ? OR emojis LIKE ?)
          ORDER BY use_count DESC, created_at DESC
          LIMIT ?
        `).all(likePattern, likePattern, likePattern, likePattern, remaining * 2);

        for (const row of likeRows) {
          if (!seenIds.has(row.id) && fs.existsSync(row.file_path)) {
            results.push(row);
            seenIds.add(row.id);
            if (results.length >= limit) break;
          }
        }
      } catch (err) {
        console.error('[STICKER VAULT] Error en búsqueda fallback:', err.message);
      }
    }

    return results;
  }

  recordUsage(id) {
    if (!this.db || !id) return;
    try {
      this.db.prepare(`
        UPDATE stickers
        SET use_count = use_count + 1, last_used_timestamp = ?
        WHERE id = ?
      `).run(Date.now(), id);
    } catch {}
  }

  count() {
    if (!this.db) return 0;
    try {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM stickers').get();
      return row?.count || 0;
    } catch {
      return 0;
    }
  }

  listRecent(limit = 10) {
    if (!this.db) return [];
    try {
      return this.db.prepare(`
        SELECT * FROM stickers
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);
    } catch {
      return [];
    }
  }

  getDb() {
    return this.db;
  }
}

const stickerVault = new StickerVault();

module.exports = stickerVault;
module.exports.StickerVault = StickerVault;
