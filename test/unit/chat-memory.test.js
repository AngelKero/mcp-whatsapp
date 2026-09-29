const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ChatMemoryStore, memoryKeyFor } = require('../../pipeline/memory-store.js');
const extract = require('../../pipeline/memory-extract.js');
const createChatMemoryMiddleware = require('../../pipeline/middlewares/chat-memory.middleware.js');

const ALICE = '5213335094748@s.whatsapp.net';
const ALICE_SENDER = '5213335094748';
const BOB = '5214810987654@s.whatsapp.net';
const GRUPO = '12036304123456789@g.us';

// Cada test crea y destruye su propio store: los subtests pueden correr en
// paralelo y no deben compartir handles ni arreglos por closure.
function freshStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-chatmem-'));
  const db = new DatabaseSync(path.join(dir, 'mem.db'));
  const store = new ChatMemoryStore(db);
  const cleanup = () => { try { db.close(); } catch {} try { fs.rmSync(dir, { recursive: true, force: true }); } catch {} };
  return { store, cleanup };
}

function makeCtx(over = {}) {
  return {
    msg: { id: over.msgId || 'msg-1' },
    text: over.text || '',
    chatJid: over.chatJid || ALICE,
    sender: over.sender || ALICE_SENDER,
    senderName: over.senderName || 'Erika',
    contactName: over.contactName || 'Erika',
    isGroup: over.isGroup || false,
    isFromAngel: over.isFromAngel !== undefined ? over.isFromAngel : false,
    isFromErika: over.isFromErika !== undefined ? over.isFromErika : true,
    isMyOwnChat: over.isMyOwnChat || false,
    permissions: { autonomy_mode: 'AUTONOMOUS' }
  };
}

function makeMw(store, replies) {
  const replyFn = async (chatJid, text, msgId) => { replies.push({ chatJid, text, msgId }); return { ID: 'r1' }; };
  return createChatMemoryMiddleware({ store, sendReply: replyFn, antiEcho: { remember() {} } });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('ChatMemoryStore: migración y CRUD', () => {
  it('crea las tablas memory_facts/settings/events con índices', () => {
    const { store, cleanup } = freshStore();
    try {
      const tables = store.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'memory_%' ORDER BY name"
      ).all().map((r) => r.name);
      assert.deepEqual(tables, ['memory_events', 'memory_facts', 'memory_settings']);
      const idx = store.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'memory_%'"
      ).all().map((r) => r.name);
      assert.ok(idx.includes('memory_facts_source_uidx'));
    } finally { cleanup(); }
  });

  it('write → read → soft-delete → read-vacío', async () => {
    const { store, cleanup } = freshStore();
    try {
      const k = memoryKeyFor(ALICE, '');
      const w = await store.saveFact({ memKey: k, key: 'hijo', value: 'Mateo', category: 'profile', sourceMsgId: 'm1' });
      assert.equal(w.action, 'saved');
      assert.equal(store.getFacts(k).length, 1);
      await store.deleteFact(w.fact.id);
      assert.equal(store.getFacts(k).length, 0);
      assert.equal(store.countFacts(k), 0);
      const actions = store.getEvents(k).map((e) => e.action);
      assert.ok(actions.includes('save') && actions.includes('delete'));
    } finally { cleanup(); }
  });

  it('misma key re-guardada actualiza (gana lo más reciente), mismo source+key se ignora', async () => {
    const { store, cleanup } = freshStore();
    try {
      const k = memoryKeyFor(ALICE, '');
      await store.saveFact({ memKey: k, key: 'hijo', value: 'Mateo', sourceMsgId: 'm1' });
      const u = await store.saveFact({ memKey: k, key: 'hijo', value: 'Mateo García', sourceMsgId: 'm2' });
      assert.equal(u.action, 'updated');
      assert.equal(store.getFacts(k)[0].value, 'Mateo García');
      const d = await store.saveFact({ memKey: k, key: 'hijo', value: 'Mateo García', sourceMsgId: 'm2' });
      assert.equal(d.action, 'ignored-duplicate');
    } finally { cleanup(); }
  });

  it('aísla chats: A no ve hechos de B', async () => {
    const { store, cleanup } = freshStore();
    try {
      await store.saveFact({ memKey: memoryKeyFor(ALICE, ''), key: 'alergia', value: 'nuez' });
      assert.equal(store.getFacts(memoryKeyFor(BOB, '')).length, 0);
    } finally { cleanup(); }
  });

  it('normaliza LID: @lid y @s.whatsapp.net con mismos dígitos comparten memoria', async () => {
    const { store, cleanup } = freshStore();
    try {
      const viaLid = memoryKeyFor('123456@lid', '');
      const viaPn = memoryKeyFor('123456@s.whatsapp.net', '');
      assert.equal(viaLid, viaPn);
      await store.saveFact({ memKey: viaLid, key: 'nombre', value: 'Test' });
      assert.equal(store.getFacts(viaPn).length, 1);
    } finally { cleanup(); }
  });

  it('en grupos separa por emisor (per-channel-peer)', async () => {
    const { store, cleanup } = freshStore();
    try {
      const k1 = memoryKeyFor(GRUPO, '5213335094748@s.whatsapp.net');
      const k2 = memoryKeyFor(GRUPO, '5214444444444@s.whatsapp.net');
      assert.notEqual(k1, k2);
      await store.saveFact({ memKey: k1, key: 'rol', value: 'profe' });
      assert.equal(store.getFacts(k2).length, 0);
      assert.equal(store.getGroupFacts(GRUPO).length, 1);
    } finally { cleanup(); }
  });

  it('devuelve null para broadcast/newsletter (sin memoria)', () => {
    assert.equal(memoryKeyFor('status@broadcast', ''), null);
    assert.equal(memoryKeyFor('123@newsletter', ''), null);
  });

  it('getTurnContext respeta budget (≤8 hechos) y deshabilitado → vacío', async () => {
    const { store, cleanup } = freshStore();
    try {
      const k = memoryKeyFor(ALICE, '');
      for (let i = 0; i < 12; i++) {
        // eslint-disable-next-line no-await-in-loop
        await store.saveFact({ memKey: k, key: `dato${i}`, value: `valor comun ${i}` });
      }
      assert.equal(store.getTurnContext(k, 'dime'), ''); // deshabilitado por defecto
      await store.setEnabled(k, ALICE, true);
      const block = store.getTurnContext(k, 'comun', { maxFacts: 8, maxChars: 1500 });
      assert.ok(block.startsWith('<memoria>'));
      const lines = block.split('\n').filter((l) => l.startsWith('- '));
      assert.ok(lines.length <= 8, `esperaba ≤8, fueron ${lines.length}`);
      assert.ok(block.length <= 1600);
    } finally { cleanup(); }
  });

  it('setChatEnabled grupal habilita emisores existentes y futuros', async () => {
    const { store, cleanup } = freshStore();
    try {
      const k1 = memoryKeyFor(GRUPO, '5213335094748@s.whatsapp.net');
      await store.saveFact({ memKey: k1, key: 'rol', value: 'profe' });
      assert.equal(store.isEnabledFor(GRUPO, '5213335094748@s.whatsapp.net'), false);
      await store.setChatEnabled(GRUPO, null, true);
      assert.equal(store.isEnabledFor(GRUPO, '5213335094748@s.whatsapp.net'), true);
      assert.equal(store.isEnabledFor(GRUPO, '5219999999999@s.whatsapp.net'), true); // futuro
    } finally { cleanup(); }
  });
});

describe('memory-extract: reglas deterministas', () => {
  it('banter genera 0 hechos', () => {
    for (const t of ['ya me voy a dormir', 'aquí ando en el centro', 'jajaja', 'ok gracias', 'hola']) {
      assert.deepEqual(extract.extractFacts(t), [], `banter no filtrado: "${t}"`);
    }
  });

  it('“soy vegetariano” genera 1 preferencia', () => {
    const facts = extract.extractFacts('soy vegetariano, recuérdalo');
    assert.equal(facts.length, 1);
    assert.equal(facts[0].category, 'preference');
    assert.ok(facts[0].value.includes('vegetariano'));
  });

  it('capa el máximo en 3 hechos por turno', () => {
    const facts = extract.extractFacts('me llamo Angel, soy vegetariano, prefiero café sin azúcar, odio el ruido, mi hijo se llama Mateo y tengo cita el viernes');
    assert.ok(facts.length <= 3);
  });

  it('ignora preguntas y muletillas de “tengo”', () => {
    assert.deepEqual(extract.extractFacts('¿tienes cita el viernes?'), []);
    assert.deepEqual(extract.extractFacts('tengo otra pregunta para el profe'), []);
    assert.deepEqual(extract.extractFacts('tengo una duda con la tarea'), []);
  });

  it('acota valores de perfil para no arrastrar cláusulas', () => {
    const facts = extract.extractFacts('trabajo en equipo pero no sé cuál sea esa tarea del proyecto final');
    assert.ok(facts.length <= 1);
    if (facts.length === 1) {
      assert.ok(facts[0].value.split(/\s+/).length <= 5, `valor acotado: "${facts[0].value}"`);
    }
  });
});

describe('chat-memory middleware: comandos y gates', () => {
  it('en grupos ignora a no-owners (misma regla que !buscar)', async () => {
    const { store, cleanup } = freshStore();
    try {
      const replies = [];
      const mw = makeMw(store, replies);
      let nextCalled = false;
      await mw(makeCtx({ text: '!recordar x', isGroup: true, isFromAngel: false, chatJid: GRUPO }), async () => { nextCalled = true; });
      assert.equal(nextCalled, true);
      assert.equal(replies.length, 0);
    } finally { cleanup(); }
  });

  it('!recordar guarda, auto-activa y confirma', async () => {
    const { store, cleanup } = freshStore();
    try {
      const replies = [];
      const mw = makeMw(store, replies);
      await mw(makeCtx({ text: '!recordar mi hijo se llama Mateo' }), async () => {});
      assert.equal(replies.length, 1);
      assert.ok(replies[0].text.includes('Anotado'));
      const k = memoryKeyFor(ALICE, ALICE_SENDER);
      assert.equal(store.isEnabled(k), true);
      assert.ok(store.getFacts(k).some((f) => f.value.includes('Mateo')));
    } finally { cleanup(); }
  });

  it('!memoria lista hechos y con memoria vacía orienta al panel', async () => {
    const { store, cleanup } = freshStore();
    try {
      const replies = [];
      const mw = makeMw(store, replies);
      await mw(makeCtx({ text: '!memoria' }), async () => {});
      assert.ok(replies[0].text.includes('Generar contexto'));
      const k = memoryKeyFor(ALICE, ALICE_SENDER);
      await store.setEnabled(k, ALICE, true);
      await store.saveFact({ memKey: k, key: 'hijo', value: 'Mateo' });
      replies.length = 0;
      await mw(makeCtx({ text: '!memoria' }), async () => {});
      assert.ok(replies[0].text.includes('Mateo'));
    } finally { cleanup(); }
  });

  it('!olvidar pide confirmación: “sí” borra, “no” conserva', async () => {
    const { store, cleanup } = freshStore();
    try {
      const replies = [];
      const mw = makeMw(store, replies);
      const k = memoryKeyFor(ALICE, ALICE_SENDER);
      await store.setEnabled(k, ALICE, true);
      await store.saveFact({ memKey: k, key: 'hijo', value: 'Mateo' });
      await mw(makeCtx({ text: '!olvidar lo del hijo' }), async () => {});
      assert.ok(replies[0].text.includes('¿Borramos esto?'));
      assert.equal(store.getFacts(k).length, 1); // sin confirmar no borra
      await mw(makeCtx({ text: 'no, déjalo' }), async () => {});
      assert.equal(store.getFacts(k).length, 1);
      await mw(makeCtx({ text: '!olvidar lo del hijo' }), async () => {});
      await mw(makeCtx({ text: 'sí' }), async () => {});
      assert.equal(store.getFacts(k).length, 0);
    } finally { cleanup(); }
  });

  it('!olvidar todo exige doble confirmación', async () => {
    const { store, cleanup } = freshStore();
    try {
      const replies = [];
      const mw = makeMw(store, replies);
      const k = memoryKeyFor(ALICE, ALICE_SENDER);
      await store.setEnabled(k, ALICE, true);
      await store.saveFact({ memKey: k, key: 'a', value: '1' });
      await store.saveFact({ memKey: k, key: 'b', value: '2' });
      await mw(makeCtx({ text: '!olvidar todo' }), async () => {});
      assert.ok(replies[0].text.includes('paso 1 de 2'));
      await mw(makeCtx({ text: 'sí' }), async () => {});
      assert.ok(replies[1].text.includes('paso 2 de 2'));
      assert.equal(store.getFacts(k).length, 2); // una sola confirmación no basta
      await mw(makeCtx({ text: 'sí, bórralo' }), async () => {});
      assert.equal(store.getFacts(k).length, 0);
    } finally { cleanup(); }
  });

  it('inyecta ctx.memoryContext cuando hay memoria; sin memoria pasa de largo', async () => {
    const { store, cleanup } = freshStore();
    try {
      const replies = [];
      const mw = makeMw(store, replies);
      const k = memoryKeyFor(ALICE, ALICE_SENDER);
      const plain = makeCtx({ text: 'qué sabes de mi hijo?' });
      let nextCalled = false;
      await mw(plain, async () => { nextCalled = true; });
      assert.equal(nextCalled, true);
      assert.equal(plain.memoryContext, undefined);
      await store.setEnabled(k, ALICE, true);
      await store.saveFact({ memKey: k, key: 'hijo', value: 'Mateo' });
      const ctx = makeCtx({ text: 'qué sabes de mi hijo?' });
      await mw(ctx, async () => {});
      assert.ok(ctx.memoryContext && ctx.memoryContext.includes('Mateo'), 'debió inyectar el hecho');
      await sleep(60); // deja correr la extracción fire-and-forget sin romper
    } finally { cleanup(); }
  });

  it('extracción post-turno guarda hechos durables sin bloquear', async () => {
    const { store, cleanup } = freshStore();
    try {
      const replies = [];
      const mw = makeMw(store, replies);
      const k = memoryKeyFor(ALICE, ALICE_SENDER);
      await store.setEnabled(k, ALICE, true);
      let nextCalled = false;
      await mw(makeCtx({ text: 'soy vegetariano', msgId: 'mx-1' }), async () => { nextCalled = true; });
      assert.equal(nextCalled, true);
      await sleep(80);
      const facts = store.getFacts(k);
      assert.ok(facts.some((f) => f.value.includes('vegetariano')));
    } finally { cleanup(); }
  });
});

describe('bootstrap: idempotencia', () => {
  it('doble bootstrap añade 0 duplicados (vía server.runMemoryBootstrap)', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-boot-'));
    const messagesPath = path.join(dir, 'messages.db');
    const memPath = path.join(dir, 'mem.db');
    const mdb = new DatabaseSync(messagesPath);
    mdb.exec('CREATE TABLE chats (jid TEXT PRIMARY KEY, name TEXT, last_message_time TIMESTAMP)');
    mdb.exec('CREATE TABLE messages (id TEXT, chat_jid TEXT, sender TEXT, content TEXT, timestamp TIMESTAMP, is_from_me BOOLEAN, PRIMARY KEY (id, chat_jid))');
    mdb.prepare('INSERT INTO chats VALUES (?,?,?)').run(ALICE, 'Erika', '2026-09-29 10:00:00');
    const ins = mdb.prepare('INSERT INTO messages (id, chat_jid, sender, content, timestamp, is_from_me) VALUES (?,?,?,?,?,?)');
    ins.run('m1', ALICE, ALICE_SENDER, 'mi hijo se llama Mateo', '2026-09-28 10:00:00', 0);
    ins.run('m2', ALICE, ALICE_SENDER, 'jajaja ok', '2026-09-28 11:00:00', 0);
    ins.run('m3', ALICE, ALICE_SENDER, 'tengo cita el viernes', '2026-09-28 12:00:00', 0);
    mdb.close();
    const prevMsg = process.env.MESSAGES_DB_PATH;
    const prevMem = process.env.MEMORY_DB_PATH;
    process.env.MESSAGES_DB_PATH = messagesPath;
    process.env.MEMORY_DB_PATH = memPath;
    try {
      const server = require('../../modules/dashboard/server.js');
      const memMod = require('../../pipeline/memory-store.js');
      memMod._resetForTests();
      const r1 = await server.runMemoryBootstrap(ALICE, 50);
      assert.ok(r1.scanned >= 3, `escaneó ${r1.scanned}`);
      assert.ok(r1.added >= 2, `añadió ${r1.added}`);
      const r2 = await server.runMemoryBootstrap(ALICE, 50);
      assert.equal(r2.added, 0, 'segunda corrida idempotente');
      memMod._resetForTests();
    } finally {
      if (prevMsg === undefined) delete process.env.MESSAGES_DB_PATH; else process.env.MESSAGES_DB_PATH = prevMsg;
      if (prevMem === undefined) delete process.env.MEMORY_DB_PATH; else process.env.MEMORY_DB_PATH = prevMem;
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  });
});
