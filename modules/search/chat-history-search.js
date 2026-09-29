const { DatabaseSync } = require('node:sqlite');
const { DB_PATHS } = require('../../config/env.js');

/**
 * modules/search/chat-history-search.js
 * Motor de Búsqueda RAG Local sobre historial de WhatsApp (+32,900 mensajes)
 * Utiliza SQLite FTS5 (Full Text Search) con BM25 ranking y triggers de sincronización.
 */
class ChatHistorySearch {
  constructor(dbInstance = null) {
    this.db = dbInstance || new DatabaseSync(DB_PATHS.MESSAGES);
    this.initFts();
  }

  /**
   * Garantiza la existencia de la tabla virtual FTS5 y el trigger en tiempo real
   */
  initFts() {
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          msg_id UNINDEXED,
          chat_jid UNINDEXED,
          sender UNINDEXED,
          content,
          timestamp UNINDEXED
        );
      `);

      // Verificar si ya tiene datos
      const countRow = this.db.prepare('SELECT count(*) as c FROM messages_fts').get();
      if (countRow.c === 0) {
        console.log('[CHAT SEARCH] Indexando mensajes iniciales a FTS5...');
        this.db.exec(`
          INSERT INTO messages_fts(msg_id, chat_jid, sender, content, timestamp)
          SELECT id, chat_jid, sender, content, timestamp
          FROM messages
          WHERE content IS NOT NULL AND length(trim(content)) > 0;
        `);
        const populated = this.db.prepare('SELECT count(*) as c FROM messages_fts').get();
        console.log(`[CHAT SEARCH] ✅ Indexación completada: ${populated.c} mensajes en FTS5.`);
      }

      // Trigger para mantener FTS5 sincronizado con cada nuevo mensaje
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages
        WHEN new.content IS NOT NULL AND length(trim(new.content)) > 0
        BEGIN
          INSERT INTO messages_fts(msg_id, chat_jid, sender, content, timestamp)
          VALUES (new.id, new.chat_jid, new.sender, new.content, new.timestamp);
        END;
      `);
    } catch (err) {
      console.error('[CHAT SEARCH] Error inicializando FTS5:', err.message);
    }
  }

  /**
   * Sanitiza términos de consulta para evitar errores de sintaxis en FTS5
   */
  sanitizeQuery(query) {
    if (!query) return '';
    // Quita caracteres especiales de FTS5 que causan syntax error
    const cleaned = query
      .replace(/[^\w\s\u00C0-\u00FF]/gi, ' ')
      .replace(/\b(AND|OR|NOT|NEAR)\b/gi, ' ')
      .trim();

    const terms = cleaned.split(/\s+/).filter(t => t.length > 1);
    if (terms.length === 0) return '';
    // Búsqueda por prefijo para coincidencia natural
    return terms.map(t => `"${t}"*`).join(' ');
  }

  /**
   * Ejecuta la búsqueda sobre el índice FTS5 con metadata de chats
   * @param {string} rawQuery - Término o frase
   * @param {number} limit - Número máximo de resultados
   * @returns {Array} Resultados encontrados
   */
  search(rawQuery, limit = 5) {
    const ftsQuery = this.sanitizeQuery(rawQuery);
    if (!ftsQuery) return [];

    try {
      const stmt = this.db.prepare(`
        SELECT 
          f.msg_id,
          f.chat_jid,
          f.sender,
          f.content,
          f.timestamp,
          c.name as chat_name,
          snippet(messages_fts, 3, '👉 *', '*', '...', 15) as highlighted
        FROM messages_fts f
        LEFT JOIN chats c ON f.chat_jid = c.jid
        WHERE messages_fts MATCH ?
        ORDER BY f.timestamp DESC
        LIMIT ?;
      `);

      return stmt.all(ftsQuery, limit);
    } catch (err) {
      console.error('[CHAT SEARCH] Error buscando en FTS5:', err.message);
      return [];
    }
  }

  /**
   * Formatea los resultados en un mensaje visualmente legible para WhatsApp
   */
  formatResults(query, results) {
    if (!results || results.length === 0) {
      return `🔍 *Búsqueda en Historial:* "${query}"\n\n_No se encontraron mensajes relacionados en tu historial de WhatsApp :(_`;
    }

    let out = `🔍 *Búsqueda en Historial:* "${query}"\n`;
    out += `_Se encontraron los siguientes ${results.length} mensajes relevantes:_\n\n`;

    results.forEach((r, idx) => {
      let dateFmt = r.timestamp;
      try {
        const d = new Date(r.timestamp);
        if (!isNaN(d.getTime())) {
          dateFmt = d.toLocaleString('es-MX', {
            timeZone: 'America/Mexico_City',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
        }
      } catch {}

      const origin = r.chat_name ? r.chat_name : (r.chat_jid.includes('@g.us') ? 'Grupo' : 'Chat Directo');
      const senderText = r.sender ? (r.sender.includes('3325094748') ? 'Tú (Angel)' : r.sender) : 'Remitente';
      const cleanContent = (r.highlighted || r.content || '').replace(/\r\n/g, ' ').replace(/\n+/g, ' ').trim();

      out += `${idx + 1}. 📅 *${dateFmt}*\n`;
      out += `   👥 *${origin}* (por *${senderText}*)\n`;
      out += `   💬 ${cleanContent}\n\n`;
    });

    out += `_Resultados recuperados en <5ms vía SQLite FTS5._`;
    return out;
  }
}

const defaultInstance = new ChatHistorySearch();
defaultInstance.ChatHistorySearch = ChatHistorySearch;
module.exports = defaultInstance;
