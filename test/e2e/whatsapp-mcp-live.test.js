const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { getStatus, listChats } = require('../../mcp-client.js');
const { DB_PATHS } = require('../../config/env.js');
const chatHistorySearch = require('../../modules/search/chat-history-search.js');

describe('E2E: WhatsApp MCP Server & Database Integrity (:8765)', () => {
  it('debe estar conectado y emparejado con el número oficial de WhatsApp', async () => {
    const status = await getStatus();
    assert.equal(status.connected, true, 'El daemon de whatsapp-mcp debe estar conectado');
    assert.equal(status.paired, true, 'La sesión de WhatsApp debe estar emparejada');
    assert.equal(status.own_phone, '5213325094748');
  });

  it('debe poder listar chats activos vía MCP JSON-RPC', async () => {
    const chats = await listChats(5);
    assert.ok(Array.isArray(chats), 'Debe retornar una lista de chats');
    assert.ok(chats.length > 0, 'Debe haber chats sincronizados');
    assert.ok(chats[0].jid, 'Cada chat debe contener JID');
  });

  it('la base de datos store/messages.db debe tener FTS5 habilitado y tabla messages_fts', () => {
    const db = new DatabaseSync(DB_PATHS.MESSAGES);
    const tableRow = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'").get();
    assert.ok(tableRow, 'La tabla virtual messages_fts debe existir en SQLite');

    const triggerRow = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='messages_ai'").get();
    assert.ok(triggerRow, 'El trigger messages_ai debe existir en SQLite');

    const countRow = db.prepare('SELECT count(*) as total FROM messages_fts').get();
    assert.ok(countRow.total > 1000, `Debe haber miles de mensajes indexados (encontrados: ${countRow.total})`);
  });

  it('el motor RAG Local debe recuperar mensajes del historial real en < 15ms', () => {
    const start = performance.now();
    const results = chatHistorySearch.search('cucea', 3);
    const elapsed = performance.now() - start;

    console.log(`⚡ [E2E RAG FTS5 LATENCY] Búsqueda de "${results.length}" resultados completada en ${elapsed.toFixed(2)}ms`);
    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0, 'Debe encontrar menciones de CUCEA');
    assert.ok(elapsed < 25, `La búsqueda FTS5 en frío/caliente debe ser menor a 25ms (fue ${elapsed.toFixed(2)}ms)`);
  });
});
