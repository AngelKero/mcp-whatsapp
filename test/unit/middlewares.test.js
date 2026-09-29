const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const createAntiEchoMiddleware = require('../../pipeline/middlewares/anti-echo.middleware.js');
const createGatekeeperMiddleware = require('../../pipeline/middlewares/gatekeeper.middleware.js');
const createSchoolNoticeMiddleware = require('../../pipeline/middlewares/school-notice.middleware.js');

describe('Pipeline Middlewares', () => {
  describe('antiEchoMiddleware', () => {
    it('debe descartar mensajes salientes de otros chats (is_from_me = 1)', async () => {
      let nextCalled = false;
      const middleware = createAntiEchoMiddleware(
        { consume: () => false },
        new Set()
      );

      const ctx = {
        msg: { is_from_me: 1 },
        text: 'Hola amigo',
        chatJid: '5213313148482@s.whatsapp.net',
        isMyOwnChat: false
      };

      await middleware(ctx, () => { nextCalled = true; });
      assert.equal(nextCalled, false, 'No debió llamar a next() para un mensaje saliente a un tercero');
    });

    it('debe descartar notificaciones automáticas previas generadas por el bot', async () => {
      const middleware = createAntiEchoMiddleware(
        { consume: () => false },
        new Set()
      );

      const systemTexts = [
        '⏰ *¡RECORDATORIO NOTION!* Entregar práctica',
        '📌 *[Notion Copilot • Solicitud agendada]*',
        '💡 *[Sugerencia detectada de Polluela]*',
        '📢 *[Aviso Escolar CUCEA]*',
        '🚨 ¡AVISO DE CLASE CANCELADA!',
        '🌅 *¡Buenos días, Ángel!*',
        '💸 *[Comprobante Registrado en Notion]*',
        '*¡Meneando la chapa activado!* 💃🔥 :3',
        'Algo con X Antigravity Bot X',
        '🔥 *ALERTA DE VENCIMIENTO (2 HORAS)*\n\n📌 *Sync de Commits*',
        '⏳ *AVISO PREVENTIVO (5 HORAS)*\n\n📌 *Práctica de Redes*',
        '💰 *BALANCÍN FINANCIERO SEMANAL*\n📅 Periodo: ...'
      ];

      for (const text of systemTexts) {
        let called = false;
        const ctx = {
          msg: { is_from_me: 0 },
          text,
          chatJid: '5213325094748@s.whatsapp.net',
          isMyOwnChat: true
        };
        await middleware(ctx, () => { called = true; });
        assert.equal(called, false, `Debió descartar la notificación: "${text}"`);
      }
    });

    it('debe descartar mensajes salientes del bot por ID registrado en sent_messages', async () => {
      let nextCalled = false;
      const middleware = createAntiEchoMiddleware(
        { consume: () => false, hasSentId: (id) => id === '3EB0123456789' },
        new Set()
      );

      const ctx = {
        msg: { id: '3EB0123456789', is_from_me: 1 },
        text: 'Cualquier texto generado por la IA',
        chatJid: '5213325094748@s.whatsapp.net',
        isMyOwnChat: true
      };

      await middleware(ctx, () => { nextCalled = true; });
      assert.equal(nextCalled, false, 'Debió descartar el mensaje por ID saliente del bot');
    });

    it('debe descartar frases de cierre y firmas del bot (blacklist estático)', async () => {
      const middleware = createAntiEchoMiddleware(
        { consume: () => false, hasSentId: () => false },
        new Set()
      );

      const botPhrases = [
        '¡De nada, Angel! Aquí andamos para lo que ocupes :3',
        '¡De nada, Angel! :3',
        '¡Con gusto! ✨',
        'xd :3',
        'Sale :3',
        '¡Entendido! 👍',
        '¡Hasta luego, Erika! Que tengas un excelente día ✨'
      ];

      for (const text of botPhrases) {
        let called = false;
        const ctx = {
          msg: { id: 'msg-loop', is_from_me: 1 },
          text,
          chatJid: '5213325094748@s.whatsapp.net',
          isMyOwnChat: true
        };
        await middleware(ctx, () => { called = true; });
        assert.equal(called, false, `Debió descartar frase estática del bot: "${text}"`);
      }
    });

    it('debe ignorar mensajes salientes en chat de terceros (is_from_me = 1) incluso si la sesión está activa', async () => {
      const sessionManager = require('../../session-manager.js');
      const testJid = '9999999999999@s.whatsapp.net';
      sessionManager.saveOrUpdateSession(testJid, 'active-conv', 'Angel');

      let nextCalled = false;
      const middleware = createAntiEchoMiddleware(
        { consume: () => false, hasSentId: () => false },
        new Set()
      );

      const ctx = {
        msg: { id: 'msg-out-casual', is_from_me: 1 },
        text: 'A ver, Erika, consejo de oro para sobrevivir al turno con sueño: aplica la regla...',
        chatJid: testJid,
        isMyOwnChat: false,
        isQuotedToBot: false
      };

      await middleware(ctx, () => { nextCalled = true; });
      sessionManager.closeSession(testJid);
      assert.equal(nextCalled, false, 'No debe dejar pasar mensajes salientes en chat de terceros sin invocación explícita');
    });

    it('debe permitir mensajes salientes en chat de terceros si Ángel invoca explícitamente (!ia, gemini, etc.)', async () => {
      let nextCalled = false;
      const middleware = createAntiEchoMiddleware(
        { consume: () => false, hasSentId: () => false },
        new Set()
      );

      const ctx = {
        msg: { id: 'msg-out-call', is_from_me: 1 },
        text: 'gemini recomiéndale algo a Erika',
        chatJid: '9999999999999@s.whatsapp.net',
        isMyOwnChat: false,
        isQuotedToBot: false
      };

      await middleware(ctx, () => { nextCalled = true; });
      assert.equal(nextCalled, true, 'Debe permitir invocar a gemini en chat de terceros');
    });

    it('debe permitir continuar (llamar next) en mensajes reales de usuarios', async () => {
      let nextCalled = false;
      const middleware = createAntiEchoMiddleware(
        { consume: () => false },
        new Set()
      );

      const ctx = {
        msg: { is_from_me: 0 },
        text: 'Oye antigravity, qué pendientes tengo hoy?',
        chatJid: '5213325094748@s.whatsapp.net',
        isMyOwnChat: true
      };

      await middleware(ctx, () => { nextCalled = true; });
      assert.equal(nextCalled, true);
    });
  });

  describe('gatekeeperMiddleware', () => {
    it('debe encolar mensajes en chatQueue si contienen invocación explícita (!ia o antigravity)', async () => {
      const enqueued = [];
      const mockQueue = {
        enqueue: (chatJid, item) => enqueued.push({ chatJid, item })
      };

      const mockAntiEcho = { remember: () => {}, consume: () => false };
      const middleware = createGatekeeperMiddleware(mockAntiEcho, mockQueue);

      const ctx = {
        text: '!ia qué es un closure en javascript?',
        chatJid: '5213313148482@s.whatsapp.net',
        sender: '5213313148482',
        senderName: 'Pipo',
        isGroup: false,
        isMyOwnChat: false,
        msg: { id: 'msg-123' },
        contactName: 'Pipo'
      };

      let nextCalled = false;
      await middleware(ctx, () => { nextCalled = true; });

      assert.equal(nextCalled, false, 'No debe pasar a next si se encoló para la IA');
      assert.equal(enqueued.length, 1);
      assert.equal(enqueued[0].chatJid, '5213313148482@s.whatsapp.net');
      assert.equal(enqueued[0].item.text, '!ia qué es un closure en javascript?');
    });

    it('debe encolar automáticamente cualquier mensaje en el chat propio de Angel', async () => {
      const enqueued = [];
      const mockQueue = {
        enqueue: (chatJid, item) => enqueued.push({ chatJid, item })
      };

      const mockAntiEcho = { remember: () => {}, consume: () => false };
      const middleware = createGatekeeperMiddleware(mockAntiEcho, mockQueue);

      const ctx = {
        text: 'recuérdame pagar el agua',
        chatJid: '5213325094748@s.whatsapp.net',
        sender: '5213325094748',
        senderName: 'Angel',
        isGroup: false,
        isMyOwnChat: true,
        msg: { id: 'msg-456' },
        contactName: 'Yo'
      };

      let nextCalled = false;
      await middleware(ctx, () => { nextCalled = true; });

      assert.equal(nextCalled, false);
      assert.equal(enqueued.length, 1);
      assert.equal(enqueued[0].item.senderName, 'Angel');
    });

    it('debe dejar pasar (llamar next) en chats de terceros sin mención al bot', async () => {
      const sessionManager = require('../../session-manager.js');
      sessionManager.closeSession('5213313148482@s.whatsapp.net');

      const enqueued = [];
      const mockQueue = {
        enqueue: (chatJid, item) => enqueued.push({ chatJid, item })
      };

      const mockAntiEcho = { remember: () => {}, consume: () => false };
      const middleware = createGatekeeperMiddleware(mockAntiEcho, mockQueue);

      const ctx = {
        text: 'vamos al cine al rato',
        chatJid: '5213313148482@s.whatsapp.net',
        sender: '5213313148482',
        senderName: 'Pipo',
        isGroup: false,
        isMyOwnChat: false,
        msg: { id: 'msg-789' },
        contactName: 'Pipo'
      };

      let nextCalled = false;
      await middleware(ctx, () => { nextCalled = true; });

      assert.equal(nextCalled, true, 'Debe llamar a next() para no interrumpir chats normales');
      assert.equal(enqueued.length, 0);
    });

    it('debe cerrar la sesión y responder con despedida cuando el mensaje es de cierre ("muchas gracias antigravity, ya me voy a mimir")', async () => {
      const sessionManager = require('../../session-manager.js');
      sessionManager.saveOrUpdateSession('5213325094748@s.whatsapp.net', 'test-session-123', 'Angel');

      const remembered = [];
      const mockAntiEcho = { remember: (t) => remembered.push(t), consume: () => false };
      const enqueued = [];
      const mockQueue = { enqueue: (jid, item) => enqueued.push(item) };

      const middleware = createGatekeeperMiddleware(mockAntiEcho, mockQueue);

      const ctx = {
        text: 'muchas gracias antigravity, ya me voy a mimir',
        chatJid: '5213325094748@s.whatsapp.net',
        sender: '5213325094748',
        senderName: 'Angel',
        isGroup: false,
        isFromAngel: true,
        isMyOwnChat: true,
        msg: { id: 'msg-closing' },
        contactName: 'Yo'
      };

      let nextCalled = false;
      await middleware(ctx, () => { nextCalled = true; });

      assert.equal(nextCalled, false, 'No debe llamar a next() al cerrar sesión');
      assert.equal(enqueued.length, 0, 'No debe encolar para la IA al cerrar sesión');
      assert.equal(sessionManager.getActiveSession('5213325094748@s.whatsapp.net'), null, 'La sesión debe quedar inactiva');
      assert.ok(remembered.length > 0, 'Debe registrar la respuesta de despedida en anti-echo');
    });
  });

  describe('schoolNoticeMiddleware', () => {
    it('debe ignorar mensajes enviados por el propio Angel (is_from_me = 1)', async () => {
      let nextCalled = false;
      const middleware = createSchoolNoticeMiddleware(
        async () => '🚨 No hay clase',
        { prepare: () => ({ get: () => null }) }
      );

      const ctx = {
        msg: { is_from_me: 1 },
        text: 'No voy a poder ir a la clase',
        chatJid: '120363411190829094@g.us', // Grupo de Programación Web
        sender: '5213325094748'
      };

      await middleware(ctx, () => { nextCalled = true; });
      assert.equal(nextCalled, false);
    });

    it('debe dejar pasar mensajes en grupos que no son de CUCEA', async () => {
      let nextCalled = false;
      const middleware = createSchoolNoticeMiddleware(
        async () => '🚨 No hay clase',
        { prepare: () => ({ get: () => null }) }
      );

      const ctx = {
        msg: { is_from_me: 0 },
        text: 'No hay clase mañana chicos',
        chatJid: '120363999999999999@g.us', // Grupo ajeno
        sender: '5213312345678'
      };

      await middleware(ctx, () => { nextCalled = true; });
      assert.equal(nextCalled, true);
    });
  });
});
