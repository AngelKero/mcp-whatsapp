const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { AntiEchoTracker } = require('../../modules/anti-echo-tracker.js');

function tempHistory() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-wake-'));
  const p = path.join(dir, 'messages.db');
  const db = new DatabaseSync(p);
  db.exec(`CREATE TABLE chats (jid TEXT PRIMARY KEY, name TEXT, last_message_time TIMESTAMP)`);
  db.exec(`CREATE TABLE messages (id TEXT, chat_jid TEXT, sender TEXT, content TEXT, timestamp TIMESTAMP, is_from_me BOOLEAN, PRIMARY KEY (id, chat_jid))`);
  db.prepare(`INSERT INTO chats VALUES (?,?,?)`).run('5219999999999@s.whatsapp.net', 'Test', '2026-01-01 00:00:00');
  const ins = db.prepare(`INSERT INTO messages (id, chat_jid, sender, content, timestamp, is_from_me) VALUES (?,?,?,?,?,?)`);
  ins.run('OLD-OWN-1', '5219999999999@s.whatsapp.net', 'me', 'hola vieja', '2026-01-02 00:00:00', 1);
  ins.run('OLD-THEIR-1', '5219999999999@s.whatsapp.net', 'them', 'hola ajena', '2026-01-02 00:00:00', 0);
  db.close();
  return { dir, p, cleanup() { try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} } };
}

describe('quote-wake-retention: despertar por citas viejas', () => {
  let tmp = null;
  let prevEnv;

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.MESSAGES_DB_PATH;
    else process.env.MESSAGES_DB_PATH = prevEnv;
    if (tmp) tmp.cleanup();
    tmp = null;
  });

  it('retención caliente de 7 días', () => {
    const t = new AntiEchoTracker();
    try {
      assert.equal(t.sentIdsTtlMs, 7 * 24 * 60 * 60 * 1000);
    } finally {
      try { t.db.close(); } catch {}
    }
  });

  it('IDs calientes siguen resolviendo por caché/tabla', () => {
    const t = new AntiEchoTracker();
    try {
      t.recordSentMessage('HOT-1', 'c', 'texto');
      assert.equal(t.hasSentId('HOT-1'), true);
    } finally {
      try { t.db.prepare('DELETE FROM sent_messages WHERE id=?').run('HOT-1'); } catch {}
      try { t.db.close(); } catch {}
    }
  });

  it('fallback: ID purgado pero propio despierta; ajeno o desconocido no', () => {
    tmp = tempHistory();
    prevEnv = process.env.MESSAGES_DB_PATH;
    process.env.MESSAGES_DB_PATH = tmp.p;
    const t = new AntiEchoTracker();
    try {
      assert.equal(t.hasSentId('OLD-OWN-1'), true, 'propio viejo despierta vía fallback');
      assert.equal(t.hasSentId('OLD-THEIR-1'), false, 'ajeno no despierta');
      assert.equal(t.hasSentId('NOPE-XYZ'), false, 'desconocido no despierta');
      assert.equal(t.hasSentId(''), false);
    } finally {
      try { t.historyDb && t.historyDb.close(); } catch {}
      try { t.db.close(); } catch {}
    }
  });

  it('fail-open: sin historial accesible devuelve false sin lanzar', () => {
    prevEnv = process.env.MESSAGES_DB_PATH;
    process.env.MESSAGES_DB_PATH = path.join(os.tmpdir(), 'no-existe-wake-test', 'm.db');
    const t = new AntiEchoTracker();
    try {
      assert.equal(t.hasSentId('ANY-1'), false);
    } finally {
      try { t.db.close(); } catch {}
    }
  });
});
