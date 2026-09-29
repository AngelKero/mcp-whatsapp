const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const sessionManager = require('../../session-manager.js');
const { detectHumanAddressee } = require('../../system-one-client.js');
const createGatekeeperMiddleware = require('../../pipeline/middlewares/gatekeeper.middleware.js');

describe('Turn-Taking, Ambient Listening & Intelligent Silence Suite', () => {
  const TEST_CHAT = '5213313148482@s.whatsapp.net';

  beforeEach(() => {
    sessionManager.closeSession(TEST_CHAT);
    sessionManager.clearAmbientBuffer(TEST_CHAT);
  });

  describe('SessionManager State Machine & Decay', () => {
    it('debe iniciar en estado IDLE si no hay sesión previa', () => {
      const state = sessionManager.getSessionState(TEST_CHAT);
      assert.equal(state.state, 'IDLE');
      assert.equal(state.conversation_id, null);
    });

    it('debe transicionar a ACTIVE al registrar sesión', () => {
      sessionManager.setSessionState(TEST_CHAT, 'ACTIVE', 'Pipo', 'conv-123');
      const state = sessionManager.getSessionState(TEST_CHAT);
      assert.equal(state.state, 'ACTIVE');
      assert.equal(state.sender_name, 'Pipo');
      assert.equal(state.conversation_id, 'conv-123');
    });

    it('debe decaer de ACTIVE a LURK_MODE si transcurre la ventana de inactividad (5 minutos)', () => {
      sessionManager.setSessionState(TEST_CHAT, 'ACTIVE', 'Pipo', 'conv-123');

      // Simular que la última actividad fue hace más de 5 minutos
      const pastTime = Date.now() - (6 * 60 * 1000);
      sessionManager.db.prepare(
        'UPDATE ai_sessions SET last_active_timestamp = ?, last_timestamp = ? WHERE chat_jid = ?'
      ).run(pastTime, pastTime, TEST_CHAT);

      const state = sessionManager.getSessionState(TEST_CHAT);
      assert.equal(state.state, 'LURK_MODE', 'Debe haber decaído a LURK_MODE');
    });

    it('debe decaer de LURK_MODE a IDLE si transcurren más de 20 minutos', () => {
      sessionManager.setSessionState(TEST_CHAT, 'LURK_MODE', 'Pipo', 'conv-123');

      // Simular que la última actividad fue hace 21 minutos
      const pastTime = Date.now() - (21 * 60 * 1000);
      sessionManager.db.prepare(
        'UPDATE ai_sessions SET last_active_timestamp = ?, last_timestamp = ? WHERE chat_jid = ?'
      ).run(pastTime, pastTime, TEST_CHAT);

      const state = sessionManager.getSessionState(TEST_CHAT);
      assert.equal(state.state, 'IDLE', 'Debe expirar a IDLE');
    });

    it('debe almacenar y recuperar mensajes en ambient_buffer', () => {
      sessionManager.recordAmbientMessage(TEST_CHAT, 'msg-1', '5213313148482', 'Pipo', 'oye creo que el examen es el viernes');
      sessionManager.recordAmbientMessage(TEST_CHAT, 'msg-2', '5213325094748', 'Angel', 'seguro? yo pensé que era el jueves');

      const context = sessionManager.getAmbientContext(TEST_CHAT, 5);
      assert.match(context, /\[Pipo\]: "oye creo que el examen es el viernes"/);
      assert.match(context, /\[Angel\]: "seguro\? yo pensé que era el jueves"/);

      sessionManager.clearAmbientBuffer(TEST_CHAT);
      const emptyContext = sessionManager.getAmbientContext(TEST_CHAT);
      assert.equal(emptyContext, '');
    });
  });

  describe('detectHumanAddressee (Heurística Anti-Interrupción)', () => {
    it('debe detectar vocativos comunes dirigidos a humanos', () => {
      assert.equal(detectHumanAddressee('oye Angel, a qué hora nos vemos?'), true);
      assert.equal(detectHumanAddressee('mira Pipo, ya quedó la tarea'), true);
      assert.equal(detectHumanAddressee('hola Erika, cómo estás?'), true);
      assert.equal(detectHumanAddressee('que onda bro Angel'), true);
    });

    it('debe detectar nombres al inicio o como destinatarios directos', () => {
      assert.equal(detectHumanAddressee('Angel, viste el correo del profe?'), true);
      assert.equal(detectHumanAddressee('Pipo: ya saliste de clases?'), true);
      assert.equal(detectHumanAddressee('y tú Angel qué opinas?'), true);
      assert.equal(detectHumanAddressee('cómo ves Pipo vamos?'), true);
    });

    it('no debe detectar preguntas fácticas o consultas directas al asistente', () => {
      assert.equal(detectHumanAddressee('¿a qué hora abre la biblioteca de CUCEA?'), false);
      assert.equal(detectHumanAddressee('cuál es la diferencia entre let y var?'), false);
      assert.equal(detectHumanAddressee('puedes resumirme las notas de hoy?'), false);
      assert.equal(detectHumanAddressee('explícame qué es un webhook'), false);
    });
  });

  describe('Gatekeeper Middleware Turn-Taking Integration', () => {
    it('debe despertar a ACTIVE y encolar si el mensaje es una cita directa al bot (isQuotedToBot: true)', async () => {
      const enqueued = [];
      const mockQueue = { enqueue: (chatJid, item) => enqueued.push({ chatJid, item }) };
      const mockAntiEcho = { remember: () => {}, consume: () => false };
      const middleware = createGatekeeperMiddleware(mockAntiEcho, mockQueue);

      const ctx = {
        text: '¿y esto cuándo se entrega?',
        chatJid: TEST_CHAT,
        sender: '5213313148482',
        senderName: 'Pipo',
        isGroup: false,
        isMyOwnChat: false,
        isQuotedToBot: true,
        quotedMessageId: 'bot-msg-123',
        msg: { id: 'user-msg-999' }
      };

      let nextCalled = false;
      await middleware(ctx, () => { nextCalled = true; });

      assert.equal(nextCalled, false, 'No debe pasar a next, debe encolarse para la IA');
      assert.equal(enqueued.length, 1);
      assert.equal(enqueued[0].item.text, '¿y esto cuándo se entrega?');

      const state = sessionManager.getSessionState(TEST_CHAT);
      assert.equal(state.state, 'ACTIVE');
    });

    it('en estado ACTIVE, debe pasar a LURK_MODE y guardar silencio si el usuario habla con otro humano', async () => {
      sessionManager.setSessionState(TEST_CHAT, 'ACTIVE', 'Pipo', 'conv-abc');

      const enqueued = [];
      const mockQueue = { enqueue: (chatJid, item) => enqueued.push({ chatJid, item }) };
      const mockAntiEcho = { remember: () => {}, consume: () => false };
      const middleware = createGatekeeperMiddleware(mockAntiEcho, mockQueue);

      const ctx = {
        text: 'oye Angel, mejor vamos por unos tacos',
        chatJid: TEST_CHAT,
        sender: '5213313148482',
        senderName: 'Pipo',
        isGroup: false,
        isMyOwnChat: false,
        isQuotedToBot: false,
        msg: { id: 'user-msg-888' }
      };

      let nextCalled = false;
      await middleware(ctx, () => { nextCalled = true; });

      assert.equal(nextCalled, true, 'Debe permitir que pase a next() sin encolar para la IA');
      assert.equal(enqueued.length, 0, 'No debe encolar nada para la IA');

      // Debe haber cambiado el estado a LURK_MODE y guardado en ambient_buffer
      const state = sessionManager.getSessionState(TEST_CHAT);
      assert.equal(state.state, 'LURK_MODE');

      const ambient = sessionManager.getAmbientContext(TEST_CHAT);
      assert.match(ambient, /oye Angel, mejor vamos por unos tacos/);
    });

    it('en estado ACTIVE, debe continuar turno si la réplica es directa y no alude a humanos', async () => {
      sessionManager.setSessionState(TEST_CHAT, 'ACTIVE', 'Pipo', 'conv-abc');

      const enqueued = [];
      const mockQueue = { enqueue: (chatJid, item) => enqueued.push({ chatJid, item }) };
      const mockAntiEcho = { remember: () => {}, consume: () => false };
      const middleware = createGatekeeperMiddleware(mockAntiEcho, mockQueue);

      const ctx = {
        text: '¿y los sábados abre la biblioteca?',
        chatJid: TEST_CHAT,
        sender: '5213313148482',
        senderName: 'Pipo',
        isGroup: false,
        isMyOwnChat: false,
        isQuotedToBot: false,
        msg: { id: 'user-msg-777' }
      };

      let nextCalled = false;
      await middleware(ctx, () => { nextCalled = true; });

      assert.equal(nextCalled, false, 'Debe encolar para la IA en turno continuo');
      assert.equal(enqueued.length, 1);
      assert.equal(enqueued[0].item.text, '¿y los sábados abre la biblioteca?');
    });

    it('en estado LURK_MODE, acumula mensajes en silencio sin interrumpir pláticas casuales', async () => {
      sessionManager.setSessionState(TEST_CHAT, 'LURK_MODE', 'Pipo', 'conv-abc');

      const enqueued = [];
      const mockQueue = { enqueue: (chatJid, item) => enqueued.push({ chatJid, item }) };
      const mockAntiEcho = { remember: () => {}, consume: () => false };
      const middleware = createGatekeeperMiddleware(mockAntiEcho, mockQueue);

      const ctx = {
        text: 'jajaja simon bro estuvo chido',
        chatJid: TEST_CHAT,
        sender: '5213313148482',
        senderName: 'Pipo',
        isGroup: false,
        isMyOwnChat: false,
        isQuotedToBot: false,
        msg: { id: 'user-msg-666' }
      };

      let nextCalled = false;
      await middleware(ctx, () => { nextCalled = true; });

      assert.equal(nextCalled, true, 'Debe guardar silencio');
      assert.equal(enqueued.length, 0);

      const ambient = sessionManager.getAmbientContext(TEST_CHAT);
      assert.match(ambient, /jajaja simon bro estuvo chido/);
    });
  });
});
