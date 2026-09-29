const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const createMacControlMiddleware = require('../../pipeline/middlewares/mac-control.middleware.js');

describe('MacControlMiddleware Unit Suite', () => {
  const fakeAntiEcho = {
    remember: () => {},
    consume: () => false
  };

  it('debe responder al comando !mac status o !mac bateria con métricas de la Mac', async () => {
    let sentMsg = null;
    const customSend = async (jid, text) => { sentMsg = text; };

    const middleware = createMacControlMiddleware(fakeAntiEcho, customSend, customSend);

    const ctx = {
      text: '!mac bateria',
      chatJid: '5213325094748@s.whatsapp.net',
      sender: '5213325094748@s.whatsapp.net',
      isGroup: false,
      msg: { id: 'msg-1' },
      isMyOwnChat: true,
      isFromAngel: true
    };

    let nextCalled = false;
    await middleware(ctx, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'No debió pasar a next()');
    assert.ok(sentMsg, 'Debió enviar un mensaje');
    assert.ok(sentMsg.includes('ESTATUS DE TU MAC'), 'Debe incluir encabezado');
    assert.ok(sentMsg.includes('Batería:'), 'Debe incluir batería');
    assert.ok(sentMsg.includes('RAM:'), 'Debe incluir RAM');
    assert.ok(sentMsg.includes('Uptime:'), 'Debe incluir uptime');
  });

  it('debe responder al comando !mac ping', async () => {
    let sentMsg = null;
    const customSend = async (jid, text) => { sentMsg = text; };

    const middleware = createMacControlMiddleware(fakeAntiEcho, customSend, customSend);

    const ctx = {
      text: '!mac ping',
      chatJid: '5213325094748@s.whatsapp.net',
      sender: '5213325094748@s.whatsapp.net',
      isGroup: false,
      msg: { id: 'msg-2' },
      isMyOwnChat: true,
      isFromAngel: true
    };

    await middleware(ctx, () => {});
    assert.ok(sentMsg.includes('Ping Acústico Disparado'), 'Debe confirmar el ping');
  });

  it('debe responder al comando !mac help', async () => {
    let sentMsg = null;
    const customSend = async (jid, text) => { sentMsg = text; };

    const middleware = createMacControlMiddleware(fakeAntiEcho, customSend, customSend);

    const ctx = {
      text: '!mac help',
      chatJid: '5213325094748@s.whatsapp.net',
      sender: '5213325094748@s.whatsapp.net',
      isGroup: false,
      msg: { id: 'msg-3' },
      isMyOwnChat: true,
      isFromAngel: true
    };

    await middleware(ctx, () => {});
    assert.ok(sentMsg.includes('COMANDOS SYSADMIN MACOS'), 'Debe mostrar la ayuda');
  });

  it('debe denegar acceso si el usuario no es Angel', async () => {
    let sentMsg = null;
    const customSend = async (jid, text) => { sentMsg = text; };

    const middleware = createMacControlMiddleware(fakeAntiEcho, customSend, customSend);

    const ctx = {
      text: '!mac status',
      chatJid: '123456@g.us',
      sender: '9999999@s.whatsapp.net',
      isGroup: true,
      msg: { id: 'msg-4' },
      isMyOwnChat: false,
      isFromAngel: false
    };

    await middleware(ctx, () => {});
    assert.ok(sentMsg.includes('Acceso Denegado'), 'Debe denegar acceso');
  });

  it('debe dejar pasar mensajes ordinarios a next()', async () => {
    const middleware = createMacControlMiddleware(fakeAntiEcho);

    const ctx = {
      text: 'Hola cómo estás',
      chatJid: '5213325094748@s.whatsapp.net',
      sender: '5213325094748@s.whatsapp.net',
      isGroup: false,
      msg: { id: 'msg-5' },
      isMyOwnChat: true,
      isFromAngel: true
    };

    let nextCalled = false;
    await middleware(ctx, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'Debió llamar a next()');
  });
});
