const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * test/helpers/mock-db.js
 * Crea bases de datos SQLite efímeras en /tmp para aislar completamente
 * los tests unitarios de las bases de datos de producción.
 */
function createTempMessagesDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-messages-'));
  const dbPath = path.join(tmpDir, 'messages.db');
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      jid TEXT PRIMARY KEY,
      name TEXT,
      last_message_time TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT,
      chat_jid TEXT,
      sender TEXT,
      content TEXT,
      timestamp TIMESTAMP,
      is_from_me BOOLEAN,
      media_type TEXT,
      filename TEXT,
      url TEXT,
      direct_path TEXT,
      media_key BLOB,
      file_sha256 BLOB,
      file_enc_sha256 BLOB,
      file_length INTEGER,
      poll_options_json TEXT,
      PRIMARY KEY (id, chat_jid),
      FOREIGN KEY (chat_jid) REFERENCES chats(jid)
    );
  `);

  return {
    db,
    dbPath,
    cleanup: () => {
      try { db.close(); } catch {}
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  };
}

function createTempSessionsDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-sessions-'));
  const dbPath = path.join(tmpDir, 'sessions.db');
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_sessions (
      chat_jid TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      last_activity INTEGER NOT NULL,
      sender_name TEXT,
      is_active INTEGER DEFAULT 1
    );
  `);

  return {
    db,
    dbPath,
    cleanup: () => {
      try { db.close(); } catch {}
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  };
}

function createTempRemindersDb() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-reminders-'));
  const dbPath = path.join(tmpDir, 'reminders.db');
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS dispatched_pulses (
      pulse_key TEXT PRIMARY KEY,
      category TEXT,
      payload TEXT,
      dispatched_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS active_reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL,
      due_time TEXT,
      notion_page_id TEXT,
      status TEXT DEFAULT 'pending',
      dispatched_5h INTEGER DEFAULT 0,
      dispatched_2h INTEGER DEFAULT 0,
      created_at INTEGER
    );
  `);

  return {
    db,
    dbPath,
    cleanup: () => {
      try { db.close(); } catch {}
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  };
}

module.exports = {
  createTempMessagesDb,
  createTempSessionsDb,
  createTempRemindersDb
};
