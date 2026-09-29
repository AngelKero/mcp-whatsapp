const { notionRequest } = require('../notion-queue.js');
const { DATABASES } = require('../config/notion-schemas.js');

/**
 * repositories/notice-repository.js
 * Encapsula la persistencia y lectura de avisos escolares de CUCEA en Notion.
 */
class NoticeRepository {
  /**
   * Publica un aviso de clase en Notion
   */
  async createNotice({ groupName, materiaId, senderName, text, tipo, origin = 'WhatsApp', url = null }) {
    const title = `[${groupName}] ${tipo.includes('🚨') ? '🚨 No hay clase' : tipo}: ${text.slice(0, 50)}...`;
    const isoDate = new Date().toISOString();
    const emoji = tipo.includes('🚨') ? '🚨' : (tipo.includes('💻') ? '💻' : '📢');

    const properties = {
      'Aviso': { title: [{ text: { content: title.slice(0, 100) } }] },
      'Tipo': { select: { name: tipo } },
      'Fecha': { date: { start: isoDate } },
      'Origen': { select: { name: origin } },
      'Profesor': { rich_text: [{ text: { content: senderName || 'Compañero/Profesor de grupo' } }] },
      'Motivo': { rich_text: [{ text: { content: text.replace(/\n+/g, ' ').slice(0, 500) } }] },
      'Visto': { checkbox: false }
    };

    if (materiaId) {
      properties['Materia'] = { relation: [{ id: materiaId }] };
    }
    if (url) {
      properties['URL'] = { url };
    }

    const children = [
      {
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: [
            { text: { content: `📱 Mensaje recibido en: ${groupName}\nRemitente: ${senderName || 'Desconocido'}\nFecha: ${new Date().toLocaleString('es-MX')}` } }
          ],
          icon: { emoji }
        }
      },
      {
        object: 'block',
        type: 'heading_3',
        heading_3: { rich_text: [{ text: { content: '💬 Mensaje' } }] }
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: { rich_text: [{ text: { content: text.slice(0, 2000) } }] }
      }
    ];

    return await notionRequest('/pages', 'POST', {
      parent: { database_id: DATABASES.AVISOS },
      properties,
      children
    });
  }

  /**
   * Obtiene los avisos existentes para evitar duplicados en Classroom
   */
  async getExistingNoticeUrls() {
    const existing = new Set();
    let hasMore = true;
    let cursor = undefined;

    while (hasMore) {
      const res = await notionRequest(`/databases/${DATABASES.AVISOS}/query`, 'POST', {
        page_size: 100,
        start_cursor: cursor
      });

      if (!res || !res.results) break;

      for (const page of res.results) {
        const u = page.properties.URL?.url;
        if (u) existing.add(u);
      }

      hasMore = res.has_more;
      cursor = res.next_cursor;
    }

    return existing;
  }
}

module.exports = new NoticeRepository();
