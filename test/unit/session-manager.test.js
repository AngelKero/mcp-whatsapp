const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTempSessionsDb } = require('../helpers/mock-db.js');

describe('SessionManager (Gestión de Sesiones SQLite)', () => {
  let tempDb;
  let db;

  beforeEach(() => {
    tempDb = createTempSessionsDb();
    db = tempDb.db;
  });

  afterEach(() => {
    tempDb.cleanup();
  });

  it('debe registrar y recuperar una sesión activa si está dentro de la ventana de 20 minutos', () => {
    const chatJid = '5213313148482@s.whatsapp.net';
    const convId = 'conv-test-123';
    const now = Date.now();

    db.prepare(`
      INSERT INTO ai_sessions (chat_jid, conversation_id, last_activity, sender_name, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(chatJid, convId, now, 'Pipo');

    const row = db.prepare('SELECT * FROM ai_sessions WHERE chat_jid = ? AND is_active = 1').get(chatJid);
    assert.ok(row);
    assert.equal(row.conversation_id, convId);
    assert.equal(row.sender_name, 'Pipo');
    assert.equal(row.is_active, 1);
  });

  it('debe considerar inactiva una sesión si pasaron más de 20 minutos de inactividad', () => {
    const chatJid = '5213313148482@s.whatsapp.net';
    const convId = 'conv-expired-456';
    const twentyFiveMinutesAgo = Date.now() - (25 * 60 * 1000);

    db.prepare(`
      INSERT INTO ai_sessions (chat_jid, conversation_id, last_activity, sender_name, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(chatJid, convId, twentyFiveMinutesAgo, 'Pipo');

    const timeoutMs = 20 * 60 * 1000;
    const session = db.prepare('SELECT * FROM ai_sessions WHERE chat_jid = ? AND is_active = 1').get(chatJid);
    const isStillActive = session && (Date.now() - session.last_activity < timeoutMs);

    assert.equal(isStillActive, false, 'La sesión debió expirar por timeout');
  });

  it('debe cerrar la sesión explícitamente cambiando is_active a 0', () => {
    const chatJid = '5213325094748@s.whatsapp.net';
    db.prepare(`
      INSERT INTO ai_sessions (chat_jid, conversation_id, last_activity, sender_name, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(chatJid, 'conv-close-789', Date.now(), 'Angel');

    db.prepare('UPDATE ai_sessions SET is_active = 0 WHERE chat_jid = ?').run(chatJid);

    const row = db.prepare('SELECT * FROM ai_sessions WHERE chat_jid = ?').get(chatJid);
    assert.ok(row);
    assert.equal(row.is_active, 0, 'is_active debió marcarse como 0');
  });

  it('debe actualizar la estampa de tiempo last_activity en cada turno nuevo', () => {
    const chatJid = '5213325094748@s.whatsapp.net';
    const initialTime = Date.now() - 50000;

    db.prepare(`
      INSERT INTO ai_sessions (chat_jid, conversation_id, last_activity, sender_name, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(chatJid, 'conv-active-111', initialTime, 'Angel');

    const newTime = Date.now();
    db.prepare('UPDATE ai_sessions SET last_activity = ? WHERE chat_jid = ?').run(newTime, chatJid);

    const row = db.prepare('SELECT last_activity FROM ai_sessions WHERE chat_jid = ?').get(chatJid);
    assert.equal(row.last_activity, newTime);
  });
});
