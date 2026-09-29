const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { MessagePipeline } = require('../../pipeline/message-pipeline.js');
const createAntiEchoMiddleware = require('../../pipeline/middlewares/anti-echo.middleware.js');
const createChatSearchMiddleware = require('../../pipeline/middlewares/chat-search.middleware.js');
const { pickModel } = require('../../system-one-client.js');

describe('E2E: Full Message Processing Pipeline & Routing', () => {
  let pipeline;
  let sentMessages;
  let mockAntiEcho;
  let botSentTexts;
  let replyResponseSent;

  beforeEach(() => {
    pipeline = new MessagePipeline();
    sentMessages = [];
    botSentTexts = new Set();
    replyResponseSent = null;

    mockAntiEcho = {
      isEcho: () => false,
      remember: (text) => { botSentTexts.add(text); },
      consume: () => false
    };

    // 1. Anti-Echo Middleware
    pipeline.use(createAntiEchoMiddleware(mockAntiEcho, botSentTexts));

    // 2. Chat Search RAG Middleware con inyección de replyFn
    pipeline.use(createChatSearchMiddleware(mockAntiEcho, async (chatJid, replyMessage, msgId, sender) => {
      replyResponseSent = { chatJid, replyMessage, msgId, sender };
    }));

    // 3. Fallback Dispatcher para pruebas de clasificación LLM
    pipeline.use(async (context, next) => {
      const model = await pickModel(context.text);
      context.routedModel = model;
      sentMessages.push({
        chatJid: context.chatJid,
        text: context.text,
        model: model
      });
      if (next) await next();
    });
  });

  it('debe interceptar comando !buscar y ejecutar RAG local FTS5 sin continuar la cadena', async () => {
    const ctx = {
      msg: { id: `rag-${Date.now()}`, is_from_me: 0 },
      text: '!buscar cucea',
      chatJid: '5213325094748@s.whatsapp.net',
      senderName: 'Angel',
      isMyOwnChat: true,
      isFromAngel: true,
      isFromErika: false,
      isGroup: false
    };

    await pipeline.execute(ctx);

    assert.ok(replyResponseSent, 'El middleware de chat search debió responder vía replyFn');
    assert.equal(replyResponseSent.chatJid, ctx.chatJid);
    assert.ok(replyResponseSent.replyMessage.includes('*Búsqueda en Historial:* "cucea"'));
    assert.ok(replyResponseSent.replyMessage.includes('SQLite FTS5'));
    // El pipeline se detuvo en chat search middleware, por lo que sentMessages no debió registrar llamada LLM
    assert.equal(sentMessages.length, 0, 'No debió pasar a modelos LLM posteriores');
  });

  it('debe descartar mensajes salientes de otros chats mediante Anti-Echo', async () => {
    const ctx = {
      msg: { id: 'out-123', is_from_me: 1 },
      text: 'Oye te veo allá al rato',
      chatJid: '5213313148482@s.whatsapp.net',
      senderName: 'Angel',
      isMyOwnChat: false,
      isFromAngel: true,
      isFromErika: false,
      isGroup: false
    };

    await pipeline.execute(ctx);
    assert.equal(sentMessages.length, 0, 'El Anti-Echo debió detener la ejecución');
  });

  it('debe enrutar al modelo correcto según complejidad evaluada en Apple M1', async () => {
    const testCases = [
      { text: 'ok enterado gracias :)', expectedTier: 'low' },
      { text: '¿Cuáles materias tengo mañana en CUCEA?', expectedNonTrivial: true },
      { text: 'Diseña una arquitectura de microservicios tolerante a fallos para procesamiento de video con Kafka y WebSockets', expectedNonTrivial: true }
    ];

    for (const tc of testCases) {
      const ctx = {
        msg: { id: `msg-${Date.now()}-${Math.random()}`, is_from_me: 0 },
        text: tc.text,
        chatJid: '5213325094748@s.whatsapp.net',
        senderName: 'Angel',
        isMyOwnChat: true,
        isFromAngel: true,
        isFromErika: false,
        isGroup: false
      };

      await pipeline.execute(ctx);
    }

    assert.equal(sentMessages.length, 3);
    assert.ok(sentMessages[0].model.includes('low'), `Esperaba tier low para texto trivial, obtuvo: ${sentMessages[0].model}`);
    assert.ok(!sentMessages[1].model.includes('low'), `No debía ser tier low para pregunta académica: ${sentMessages[1].model}`);
    assert.ok(!sentMessages[2].model.includes('low'), `No debía ser tier low para prompt técnico: ${sentMessages[2].model}`);
  });
});
