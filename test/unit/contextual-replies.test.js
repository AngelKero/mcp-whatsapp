const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { sendReplyOrFallback } = require('../../mcp-client.js');
const createChatSearchMiddleware = require('../../pipeline/middlewares/chat-search.middleware.js');
const createChatMemoryMiddleware = require('../../pipeline/middlewares/chat-memory.middleware.js');

function calls() {
  const log = [];
  return {
    log,
    replyFn: async (chatJid, body, messageId, senderJid = '') => {
      log.push({ tool: 'send_reply', chatJid, body, messageId, senderJid });
      return { ID: 'reply-1' };
    },
    plainFn: async (recipient, message) => {
      log.push({ tool: 'send_message', recipient, message });
      return { ID: 'msg-1' };
    }
  };
}

describe('sendReplyOrFallback: despacho contextual', () => {
  it('cita por defecto con payload correcto en 1:1 (sin sender)', async () => {
    const f = calls();
    const res = await sendReplyOrFallback('5219999999999@s.whatsapp.net', 'hola', {
      messageId: 'ABC123', senderJid: '', isGroup: false
    }, { sendReplyFn: f.replyFn, sendMessageFn: f.plainFn });
    assert.equal(f.log.length, 1);
    assert.equal(f.log[0].tool, 'send_reply');
    assert.equal(f.log[0].messageId, 'ABC123');
    assert.equal(f.log[0].senderJid, '');
    assert.equal(res.ID, 'reply-1', 'propaga el ID para anti-echo downstream');
  });

  it('en grupo incluye el sender JID', async () => {
    const f = calls();
    await sendReplyOrFallback('12036301@g.us', 'hola', {
      messageId: 'ABC123', senderJid: '5219999999999@s.whatsapp.net', isGroup: true
    }, { sendReplyFn: f.replyFn, sendMessageFn: f.plainFn });
    assert.equal(f.log.length, 1);
    assert.equal(f.log[0].tool, 'send_reply');
    assert.equal(f.log[0].senderJid, '5219999999999@s.whatsapp.net');
  });

  it('sin messageId va directo a send_message sin intentar cita', async () => {
    const f = calls();
    const res = await sendReplyOrFallback('5219999999999@s.whatsapp.net', 'briefing', {},
      { sendReplyFn: f.replyFn, sendMessageFn: f.plainFn });
    assert.equal(f.log.length, 1);
    assert.equal(f.log[0].tool, 'send_message');
    assert.equal(res.ID, 'msg-1');
  });

  it('si send_reply falla, un solo fallback en plano (exactamente un mensaje)', async () => {
    const f = calls();
    const brokenReply = async () => { throw new Error('cita expirada'); };
    const res = await sendReplyOrFallback('5219999999999@s.whatsapp.net', 'hola',
      { messageId: 'OLD', senderJid: '', isGroup: false },
      { sendReplyFn: brokenReply, sendMessageFn: f.plainFn });
    assert.equal(f.log.length, 1, 'solo el fallback debe enviar');
    assert.equal(f.log[0].tool, 'send_message');
    assert.equal(res.ID, 'msg-1', 'propaga el ID del fallback para anti-echo');
  });

  it('si ambas rutas fallan, lanza (sin tercer intento)', async () => {
    let n = 0;
    const fail = async () => { n += 1; throw new Error('down'); };
    await assert.rejects(() => sendReplyOrFallback('x@s.whatsapp.net', 'hola',
      { messageId: 'M', senderJid: '', isGroup: false },
      { sendReplyFn: fail, sendMessageFn: fail }));
    assert.equal(n, 2, 'reply + un fallback, nada más');
  });
});

describe('middlewares: referencia propagada y chat propio', () => {
  it('chat-search cita con target_message_id y sender solo en grupos', async () => {
    const seen = [];
    const mw = createChatSearchMiddleware({ remember() {} },
      async (chatJid, body, msgId, senderJid = '') => { seen.push({ chatJid, msgId, senderJid }); return {}; });
    // 1:1
    await mw({ text: '!buscarnothing_xyz unlikely', chatJid: '5219999999999@s.whatsapp.net', sender: '', isGroup: false, msg: { id: 'M1' }, isFromAngel: true }, async () => {});
    // grupo
    await mw({ text: '!buscar calificaciones', chatJid: '12036301@g.us', sender: '5219999999999@s.whatsapp.net', isGroup: true, msg: { id: 'M2' }, isFromAngel: true }, async () => {});
    const grp = seen.find((s) => s.msgId === 'M2');
    assert.ok(grp, 'el comando en grupo debió responder citando');
    assert.equal(grp.senderJid, '5219999999999@s.whatsapp.net');
  });

  it('chat-memory en chat propio usa sendMessage flotante (sin cita)', async () => {
    const { DatabaseSync } = require('node:sqlite');
    const { ChatMemoryStore } = require('../../pipeline/memory-store.js');
    const db = new DatabaseSync(':memory:');
    const store = new ChatMemoryStore(db);
    const sent = [];
    const mw = createChatMemoryMiddleware({
      store,
      sendReply: async () => { throw new Error('no debería citar en chat propio'); },
      sendMessage: async (jid, txt) => { sent.push({ jid, txt }); return {}; },
      antiEcho: { remember() {} }
    });
    await mw({
      text: '!memoria', chatJid: '5213325094748@s.whatsapp.net', sender: '5213325094748',
      isGroup: false, isFromAngel: true, isMyOwnChat: true, msg: { id: 'M9' }
    }, async () => {});
    assert.equal(sent.length, 1);
    store.close();
  });
});
