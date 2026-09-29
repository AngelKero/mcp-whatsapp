const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTempMessagesDb } = require('../helpers/mock-db.js');
const { ChatHistorySearch } = require('../../modules/search/chat-history-search.js');

describe('ChatHistorySearch (RAG Local FTS5)', () => {
  let tempDb;
  let db;
  let searchEngine;

  beforeEach(() => {
    tempDb = createTempMessagesDb();
    db = tempDb.db;

    // Insertar chats requeridos por la foreign key constraint
    db.prepare(`
      INSERT OR IGNORE INTO chats (jid, name)
      VALUES 
        ('5213313148482@s.whatsapp.net', 'Pipo Chat'),
        ('5213325094748@s.whatsapp.net', 'Angel Zaragoza'),
        ('12036304@g.us', 'CUCEA Redes Grupo')
    `).run();

    // Instanciar motor inyectando la base de datos efímera
    searchEngine = new ChatHistorySearch(db);
  });

  afterEach(() => {
    tempDb.cleanup();
  });

  it('debe sincronizar automáticamente los mensajes insertados en messages hacia messages_fts mediante el trigger', () => {
    db.prepare(`
      INSERT INTO messages (id, chat_jid, sender, content, timestamp, is_from_me)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('msg-101', '5213313148482@s.whatsapp.net', '5213313148482', 'El examen de redes es el viernes a las 4pm', '2026-09-26 10:00:00', 0);

    const ftsRow = db.prepare('SELECT msg_id, content FROM messages_fts WHERE messages_fts MATCH ?').get('redes');
    assert.ok(ftsRow, 'El mensaje debió sincronizarse a FTS5 automáticamente');
    assert.equal(ftsRow.msg_id, 'msg-101');
    assert.ok(ftsRow.content.includes('examen de redes'));
  });

  it('debe ordenar por timestamp y encontrar coincidencias con search()', () => {
    db.prepare(`
      INSERT INTO messages (id, chat_jid, sender, content, timestamp, is_from_me)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('msg-201', '5213325094748@s.whatsapp.net', 'Angel', 'Docker es una herramienta de contenedores', '2026-09-26 11:00:00', 1);

    db.prepare(`
      INSERT INTO messages (id, chat_jid, sender, content, timestamp, is_from_me)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('msg-202', '5213325094748@s.whatsapp.net', 'Angel', 'Docker compose en producción para microservicios', '2026-09-26 12:00:00', 1);

    const results = searchEngine.search('docker');

    assert.equal(results.length, 2);
    assert.equal(results[0].msg_id, 'msg-202', 'El mensaje más reciente debe retornar primero');
    assert.equal(results[0].chat_name, 'Angel Zaragoza');
  });

  it('debe formatear los resultados correctamente en formato WhatsApp legible', () => {
    db.prepare(`
      INSERT INTO messages (id, chat_jid, sender, content, timestamp, is_from_me)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('msg-301', '12036304@g.us', 'Profesor', 'Entrega de proyecto final de sistemas', '2026-09-26 15:30:00', 0);

    const results = searchEngine.search('proyecto');
    const formatted = searchEngine.formatResults('proyecto', results);

    assert.ok(formatted.includes('*Búsqueda en Historial:* "proyecto"'));
    assert.ok(formatted.includes('CUCEA Redes Grupo'));
    assert.ok(formatted.includes('proyecto'));
    assert.ok(formatted.includes('SQLite FTS5'));
  });

  it('debe retornar mensaje amigable cuando no hay resultados', () => {
    const formatted = searchEngine.formatResults('palabra_inexistente_xyz', []);
    assert.ok(formatted.includes('No se encontraron mensajes relacionados'));
  });

  it('debe sanitizar adecuadamente queries peligrosas con operadores SQLite FTS5', () => {
    const dangerousQueries = [
      'docker" OR 1=1; --',
      '***',
      'redes (examen',
      'AND OR NOT',
      'test:column',
      'foo*bar'
    ];

    for (const q of dangerousQueries) {
      assert.doesNotThrow(() => {
        const results = searchEngine.search(q);
        assert.ok(Array.isArray(results));
      }, `No debió fallar con query: "${q}"`);
    }
  });
});
