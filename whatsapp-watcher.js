const path = require('path');
const { exec } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { sendMessage, sendReplyOrFallback, sendReaction, sendFile, sendTyping } = require('./mcp-client.js');
const { sendMorningBriefing } = require('./daily-briefing.js');
const sessionManager = require('./session-manager.js');
const reminderScheduler = require('./reminder-scheduler.js');
const financeReport = require('./finance-report.js');
const secondBrainAuditor = require('./second-brain-auditor.js');
const passiveExtractor = require('./passive-extractor.js');
const { classifySchoolNotice, isTrivialMessage, classifyStickerIntent, classifyBotMention } = require('./system-one-client.js');
const proactivePulseEngine = require('./modules/proactive/proactive-pulse.js');
const stickerResponder = require('./modules/stickers/sticker-responder.js');

// Configuración centralizada
const { DB_PATHS, MY_PHONE_JID } = require('./config/env.js');
const { isMarketplaceChat } = require('./config/marketplace-filter.js');

// Middlewares del Pipeline
const { MessagePipeline } = require('./pipeline/message-pipeline.js');
const createAntiEchoMiddleware = require('./pipeline/middlewares/anti-echo.middleware.js');
const createChatPermissionsMiddleware = require('./pipeline/middlewares/chat-permissions.middleware.js');
const createChatMemoryMiddleware = require('./pipeline/middlewares/chat-memory.middleware.js');
const createMediaExtractorMiddleware = require('./pipeline/middlewares/media-extractor.middleware.js');
const createChatSearchMiddleware = require('./pipeline/middlewares/chat-search.middleware.js');
const createGatekeeperMiddleware = require('./pipeline/middlewares/gatekeeper.middleware.js');
const createMacControlMiddleware = require('./pipeline/middlewares/mac-control.middleware.js');
const createPassiveExtractorMiddleware = require('./pipeline/middlewares/passive-extractor.middleware.js');
const createSchoolNoticeMiddleware = require('./pipeline/middlewares/school-notice.middleware.js');

// Crash Guards y Manejo de Señales
process.on('uncaughtException', (err) => {
  console.error('💥 [CRASH GUARD] Excepción no capturada:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('💥 [CRASH GUARD] Promesa rechazada no manejada:', reason);
});

const handleSignal = (signal) => {
  console.log(`\n🛑 [WATCHER] Señal ${signal} recibida. Cerrando recursos limpiamente...`);
  try {
    if (db) db.close();
  } catch {}
  process.exit(0);
};
process.on('SIGTERM', () => handleSignal('SIGTERM'));
process.on('SIGINT', () => handleSignal('SIGINT'));

// Clases de soporte en memoria
const antiEcho = require('./modules/anti-echo-tracker.js');

class TypingPresenceManager {
  constructor() {
    this.intervals = new Map();
  }

  start(chatJid) {
    this.stop(chatJid);
    sendTyping(chatJid, true).catch(() => {});
    const timer = setInterval(() => {
      sendTyping(chatJid, true).catch(() => {});
    }, 3000);
    this.intervals.set(chatJid, timer);
  }

  stop(chatJid) {
    const timer = this.intervals.get(chatJid);
    if (timer) {
      clearInterval(timer);
      this.intervals.delete(chatJid);
      sendTyping(chatJid, false).catch(() => {});
    }
  }
}

class ChatQueueManager {
  constructor(debounceMs = 2000, handler = null) {
    this.debounceMs = debounceMs;
    this.handler = handler;
    this.queues = new Map();
  }

  _getOrCreate(chatJid) {
    let q = this.queues.get(chatJid);
    if (!q) {
      q = {
        timer: null,
        items: [],
        isProcessing: false,
        pendingMediaCount: 0,
        lastEnqueueTime: 0
      };
      this.queues.set(chatJid, q);
    }
    return q;
  }

  startMediaPending(chatJid, msgId) {
    const q = this._getOrCreate(chatJid);
    q.pendingMediaCount++;
    if (q.timer) {
      clearTimeout(q.timer);
      q.timer = null;
    }
    console.log(`⏳ [QUEUE MEDIA LOCK] Esperando extracción multimedia (${msgId || 'media'}) en ${chatJid} (pendientes: ${q.pendingMediaCount})...`);
  }

  finishMediaPending(chatJid, msgId) {
    const q = this.queues.get(chatJid);
    if (!q) return;
    q.pendingMediaCount = Math.max(0, q.pendingMediaCount - 1);
    console.log(`✨ [QUEUE MEDIA READY] Extracción multimedia completada (${msgId || 'media'}) en ${chatJid} (restantes: ${q.pendingMediaCount})`);

    // Si ya no quedan tareas multimedia pendientes y hay items en cola, resetear timer de despacho con debounce completo
    if (q.pendingMediaCount === 0 && q.items.length > 0 && !q.isProcessing) {
      if (q.timer) clearTimeout(q.timer);
      q.timer = setTimeout(() => this.dispatch(chatJid), this.debounceMs);
    }
  }

  enqueue(chatJid, item) {
    const q = this._getOrCreate(chatJid);
    q.items.push(item);
    q.lastEnqueueTime = Date.now();

    // Si hay medios pendientes de descarga/análisis en este chat, pausar timer de despacho
    if (q.pendingMediaCount > 0) {
      console.log(`📥 [QUEUE ENQUEUE] Mensaje encolado en ${chatJid} mientras hay ${q.pendingMediaCount} medios en análisis. Pausando timer.`);
      if (q.timer) {
        clearTimeout(q.timer);
        q.timer = null;
      }
      return;
    }

    // Si la IA ya está procesando un turno previo, no disparamos timer de despacho inmediato;
    // el finally de dispatch lo retomará respetando el debounce
    if (q.isProcessing) {
      console.log(`📥 [QUEUE ENQUEUE] Mensaje encolado en ${chatJid} durante turno activo de IA. Esperará fin del turno.`);
      return;
    }

    if (q.timer) clearTimeout(q.timer);
    q.timer = setTimeout(() => this.dispatch(chatJid), this.debounceMs);
  }

  async dispatch(chatJid) {
    const q = this.queues.get(chatJid);
    if (!q || q.items.length === 0) return;

    // Si todavía hay medios procesándose (descarga, OCR, VLM), posponer despacho
    if (q.pendingMediaCount > 0) {
      console.log(`⏳ [QUEUE DISPATCH HOLD] Pospuesto despacho en ${chatJid}: ${q.pendingMediaCount} medios aún en proceso.`);
      if (q.timer) clearTimeout(q.timer);
      q.timer = setTimeout(() => this.dispatch(chatJid), 1000);
      return;
    }

    // Si la IA está ocupada respondiendo el turno anterior, posponer 1 segundo
    if (q.isProcessing) {
      if (q.timer) clearTimeout(q.timer);
      q.timer = setTimeout(() => this.dispatch(chatJid), 1000);
      return;
    }

    // Respetar debounce si el último mensaje llegó hace menos de debounceMs
    const elapsedSinceLastEnqueue = Date.now() - q.lastEnqueueTime;
    if (elapsedSinceLastEnqueue < this.debounceMs) {
      const waitTime = this.debounceMs - elapsedSinceLastEnqueue;
      if (q.timer) clearTimeout(q.timer);
      q.timer = setTimeout(() => this.dispatch(chatJid), waitTime);
      return;
    }

    q.isProcessing = true;
    if (q.timer) {
      clearTimeout(q.timer);
      q.timer = null;
    }

    // Ordenar cronológicamente por rowid o timestamp para que el orden de la ráfaga sea 100% fiel
    const batch = [...q.items];
    batch.sort((a, b) => {
      const rA = a.msg?.rowid || 0;
      const rB = b.msg?.rowid || 0;
      if (rA && rB) return rA - rB;
      const tA = new Date(a.msg?.timestamp || 0).getTime();
      const tB = new Date(b.msg?.timestamp || 0).getTime();
      return tA - tB;
    });

    q.items = [];

    try {
      if (this.handler) await this.handler(chatJid, batch);
    } catch (err) {
      console.error(`[QUEUE ERROR] Error en ${chatJid}:`, err.message);
    } finally {
      q.isProcessing = false;
      if (q.items.length > 0) {
        if (q.timer) clearTimeout(q.timer);
        q.timer = setTimeout(() => this.dispatch(chatJid), this.debounceMs);
      } else if (q.pendingMediaCount === 0) {
        this.queues.delete(chatJid);
      }
    }
  }
}
const presenceManager = new TypingPresenceManager();
const processedMessageIds = new Set();
const botSentTexts = new Set();
let db = null;
let lastProcessedRowid = 0;
let lastBriefingDate = '';
let lastFinanceReportDate = '';
let lastAuditDate = '';

// Acuse visual de turno (spec ack-reactions): 👀 + typing al abrir,
// limpieza en finally. Fire-and-forget en montaje (cero latencia),
// best-effort en limpieza; ningún fallo interrumpe el turno.
const { withAckReaction } = require('./pipeline/ack.js');
const ackDeps = {
  sendReactionFn: (...args) => sendReaction(...args),
  sendTypingFn: (chatJid, active) => sendTyping(chatJid, active),
  log: (...args) => console.log('[ACK]', ...args)
};

// Procesador Multi-Turn con Antigravity
async function processAiTurn(chatJid, lastMsg, combinedText, senderName, isGroup, isFromAngel, isFromErika, isMyOwnChat, contactName) {
  return withAckReaction(ackDeps, {
    chatJid,
    msgId: lastMsg && lastMsg.id,
    senderJid: isGroup && lastMsg ? lastMsg.sender : '',
    isGroup: !!isGroup
  }, () => processAiTurnInner(chatJid, lastMsg, combinedText, senderName, isGroup, isFromAngel, isFromErika, isMyOwnChat, contactName));
}

async function processAiTurnInner(chatJid, lastMsg, combinedText, senderName, isGroup, isFromAngel, isFromErika, isMyOwnChat, contactName) {
  const cleanQuery = combinedText
    .replace(/[!/]ai\b/gi, '')
    .replace(/[!/]ia\b/gi, '')
    .replace(/[!/]jarvis\b/gi, '')
    .replace(/[!/]gemini\b/gi, '')
    .replace(/@?antigravity\b/gi, '')
    .replace(/@?jarvis\b/gi, '')
    .replace(/@?gemini\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Fast path Notion (omitir en chats de compra/venta)
  if (!isMarketplaceChat(chatJid, contactName)) {
    const fastResult = await passiveExtractor.processMessage(cleanQuery || combinedText, isMyOwnChat, { isFromAngel, isFromErika, isMyOwnChat, chatJid });
    if (fastResult?.message) {
      console.log(`⚡ [FAST PATH] Notion: ${fastResult.action}`);
      const activeSession = sessionManager.getActiveSession(chatJid);
      sessionManager.saveOrUpdateSession(chatJid, activeSession?.conversation_id || 'fast-session', senderName);
      antiEcho.remember(fastResult.message);
      botSentTexts.add(fastResult.message.trim());
      let sentRes;
      if (isMyOwnChat) {
        sentRes = await sendMessage(chatJid, fastResult.message);
      } else {
        sentRes = await sendReplyOrFallback(chatJid, fastResult.message, {
          messageId: lastMsg.id, senderJid: isGroup ? lastMsg.sender : '', isGroup
        });
      }
      const sentId = sentRes?.ID || sentRes?.id;
      if (sentId) {
        processedMessageIds.add(sentId);
        antiEcho.recordSentMessage(sentId, chatJid, fastResult.message);
      }
      if (chatJid !== MY_PHONE_JID && isFromErika) {
        await sendMessage(MY_PHONE_JID, `📌 *[Notion Copilot • Solicitud de Polluela agendada]*\n\n${fastResult.message}`);
      }
      return;
    }
  }

  // LLM Gatekeeper para reacciones triviales
  const activeSession = sessionManager.getActiveSession(chatJid);
  const isExplicitAi = await classifyBotMention(combinedText);
  if (activeSession && !isExplicitAi && await isTrivialMessage(cleanQuery || combinedText)) {
    console.log(`🛡️ [LLM GATEKEEPER] Trivial descartado sin agy: "${combinedText}"`);
    const q = (cleanQuery || combinedText).toLowerCase().trim();
    const isThanks = /^(?:gracias|muchas\s+gracias|mil\s+gracias|grax|ty|thx)/i.test(q);
    const isLaugh = /^(?:jaj+a*|xd+|:3|lol)/i.test(q);
    const isAck = /^(?:ok|va|sim[oó]n|sale|listo|entendido|enterado|chido|arriba|👍|👌)/i.test(q);

    let quickReply = '';
    if (isThanks) {
      quickReply = isFromAngel ? '¡De nada, Angel! :3' : '¡Con gusto! ✨';
    } else if (isLaugh) {
      quickReply = isFromAngel ? 'xd :3' : ':)';
    } else if (isAck) {
      quickReply = isFromAngel ? 'Sale :3' : '¡Entendido! 👍';
    } else {
      quickReply = isFromAngel ? ':3' : '✨';
    }

    antiEcho.remember(quickReply);
    botSentTexts.add(quickReply.trim());
    let sentRes;
    if (isMyOwnChat) {
      sentRes = await sendMessage(chatJid, quickReply);
    } else {
      sentRes = await sendReplyOrFallback(chatJid, quickReply, {
        messageId: lastMsg.id, senderJid: isGroup ? lastMsg.sender : '', isGroup
      });
    }
    const sentId = sentRes?.ID || sentRes?.id;
    if (sentId) {
      processedMessageIds.add(sentId);
      antiEcho.recordSentMessage(sentId, chatJid, quickReply);
    }
    return;
  }

  console.log(`🤖 [IA] Sesión en ${chatJid} por ${senderName}: "${combinedText}"`);
  presenceManager.start(chatJid);

  try {
    let contextHistory = '';
    // Memoria por chat: contexto durable de esta persona antes del historial verbatim.
    // latest user message > session facts > global defaults (fail-open).
    try {
      const memStore = require('./pipeline/memory-store.js').getMemoryStore();
      const memBlock = memStore.getTurnContextFor(chatJid, lastMsg.sender, combinedText);
      if (memBlock) contextHistory += `${memBlock}\n`;
    } catch {}
    try {
      const recentRows = db.prepare(
        "SELECT sender, content, is_from_me FROM messages WHERE chat_jid = ? AND rowid < ? AND content IS NOT NULL AND trim(content) != '' ORDER BY rowid DESC LIMIT 8"
      ).all(chatJid, lastMsg.rowid);

      if (recentRows && recentRows.length > 0) {
        recentRows.reverse();
        contextHistory = recentRows.map(r => `[${r.is_from_me === 1 ? 'Angel' : senderName}]: "${(r.content || '').replace(/\n+/g, ' ').slice(0, 200)}"`).join('\n');
      }
    } catch {}

    const aiResult = await sessionManager.runConversationTurn(senderName, cleanQuery || combinedText, isGroup, chatJid, contextHistory);
    if (aiResult.reply) {
      antiEcho.remember(aiResult.reply);
      botSentTexts.add(aiResult.reply.trim());
    }
    presenceManager.stop(chatJid);

    try {
      let sentRes;
      if (isMyOwnChat) {
        sentRes = await sendMessage(chatJid, aiResult.reply);
        console.log(`📤 [IA RESPUESTA] Enviada a ${chatJid}: "${aiResult.reply.replace(/\n/g, ' ').slice(0, 60)}..."`);
      } else {
        sentRes = await sendReplyOrFallback(chatJid, aiResult.reply, {
          messageId: lastMsg.id, senderJid: isGroup ? lastMsg.sender : '', isGroup
        });
        console.log(`📤 [IA RESPUESTA CITADA] Enviada a ${chatJid} (citando ${lastMsg.id}): "${aiResult.reply.replace(/\n/g, ' ').slice(0, 60)}..."`);
      }
      const sentId = sentRes?.ID || sentRes?.id;
      if (sentId) {
        processedMessageIds.add(sentId);
        antiEcho.recordSentMessage(sentId, chatJid, aiResult.reply);
      }
    } catch (sendErr) {
      // El helper ya reintentó una vez en plano; no reenviar (presupuesto: un mensaje).
      console.error(`[SEND ERROR] Respuesta a ${chatJid} falló tras fallback:`, sendErr.message);
    }

    // Selección y despacho pragmático de Stickers
    if (!combinedText.includes('X Bot X')) {
      stickerResponder.recordTurn(chatJid);
      const stickerDecision = stickerResponder.shouldSendSticker(chatJid, combinedText, aiResult.reply, false);
      if (stickerDecision.allowed) {
        const sentRes = await stickerResponder.selectAndSendSticker(chatJid, combinedText, aiResult.reply);
        const sentId = sentRes?.res?.ID || sentRes?.res?.id;
        if (sentId) {
          processedMessageIds.add(sentId);
          antiEcho.recordSentMessage(sentId, chatJid, '');
          antiEcho.rememberSticker(sentId);
        }
        if (sentRes?.stickerId) {
          antiEcho.rememberSticker(sentRes.stickerId);
        }
      }
    }

    // Si es un grupo comercial/ventas, cerrar la sesión de inmediato a IDLE para no dejar ventanas calientes abiertas
    if (isMarketplaceChat(chatJid, contactName)) {
      sessionManager.closeSession(chatJid);
      console.log(`🔒 [MARKETPLACE] Sesión cerrada a IDLE inmediatamente en ${chatJid} tras responder.`);
    }
  } catch (err) {
    presenceManager.stop(chatJid);
    console.error('Error respondiendo a IA:', err.message);
  }
}

// Queue Manager con debounce de 2 segundos para ráfagas multimodales (texto + fotos + stickers)
const chatQueue = new ChatQueueManager(2000, async (chatJid, batch) => {
  const lastItem = batch[batch.length - 1];
  const textPieces = batch.map(b => b.text).filter(t => t && t.trim()).map(t => t.trim());
  if (textPieces.length === 0) return;
  const combinedText = textPieces.join('\n\n');
  console.log(`📦 [BURST BATCH] Procesando ráfaga unificada de ${batch.length} mensaje(s) en ${chatJid}`);
  await processAiTurn(chatJid, lastItem.msg, combinedText, lastItem.senderName, lastItem.isGroup, lastItem.isFromAngel, lastItem.isFromErika, lastItem.isMyOwnChat, lastItem.contactName);
});

// Clasificador 100% Laya-MLX de avisos escolares
async function classifyMessage(text) {
  try {
    const layaResult = await classifySchoolNotice(text);
    if (layaResult?.tipo) return layaResult.tipo;
  } catch (err) {
    console.error('[CLASSIFY NOTICE] Error en Laya-MLX:', err.message);
  }
  return null;
}

// Inicialización del Pipeline
const messagePipeline = new MessagePipeline()
  .use(createAntiEchoMiddleware(antiEcho, botSentTexts))
  .use(createChatPermissionsMiddleware({ antiEcho }))
  .use(createChatMemoryMiddleware({ antiEcho }))
  .use(createMediaExtractorMiddleware(chatQueue))
  .use(createChatSearchMiddleware(antiEcho))
  .use(createMacControlMiddleware(antiEcho))
  .use(createGatekeeperMiddleware(antiEcho, chatQueue))
  .use(createPassiveExtractorMiddleware())
  .use(createSchoolNoticeMiddleware(classifyMessage, { prepare: (q) => db.prepare(q) }));

// Bucle principal de ejecución del Observador
function initWatcher() {
  console.log('========================================================================');
  console.log('🟢 Observador WhatsApp v2 (Modular Pipeline): Memoria + Notion + CUCEA');
  console.log('========================================================================\n');

  try {
    db = new DatabaseSync(DB_PATHS.MESSAGES, { readOnly: true });
    const maxRow = db.prepare('SELECT MAX(rowid) as maxId FROM messages').get();
    lastProcessedRowid = maxRow?.maxId || 0;
    console.log(`📡 Base de datos SQLite conectada. Punto de inicio rowid: ${lastProcessedRowid}`);

    // Precargar IDs de mensajes salientes enviados por el bot para ignorarlos de inmediato
    try {
      const recentSent = antiEcho.getRecentSentIds(1000);
      for (const id of recentSent) {
        processedMessageIds.add(id);
      }
      if (recentSent.length > 0) {
        console.log(`🛡️ [ANTI-ECHO] Precargados ${recentSent.length} IDs de mensajes salientes del bot en memoria.`);
      }
    } catch {}
  } catch (err) {
    console.error('Error abriendo messages.db:', err.message);
  }

  reminderScheduler.start(60000);

  // Panel Web Local de Administración (puerto 8767) con crash guard para no tirar el watcher
  try {
    const { startDashboardServer } = require('./modules/dashboard/server.js');
    startDashboardServer({ port: parseInt(process.env.DASHBOARD_PORT || '8767', 10) || 8767 });
  } catch (err) {
    console.error('🎛️ [DASHBOARD] No se pudo iniciar el panel (el watcher sigue corriendo):', err.message);
  }

  // Migración de memoria por chat (tablas IF NOT EXISTS, fail-open)
  try {
    require('./pipeline/memory-store.js').getMemoryStore();
    console.log('🧠 [CHAT-MEMORY] Tablas de memoria listas.');
  } catch (err) {
    console.error('🧠 [CHAT-MEMORY] Migración omitida (fail-open):', err.message);
  }

  setInterval(async () => {
    if (!db) {
      try { db = new DatabaseSync(DB_PATHS.MESSAGES, { readOnly: true }); } catch { return; }
    }

    try {
      const rows = db.prepare(
        'SELECT rowid, id, chat_jid, sender, content, timestamp, is_from_me, media_type, quoted_message_id, quoted_participant FROM messages WHERE rowid > ? ORDER BY rowid ASC LIMIT 50'
      ).all(lastProcessedRowid);

      for (const msg of rows) {
        lastProcessedRowid = msg.rowid;
        const chatJid = msg.chat_jid || '';

        // Ignorar de inmediato difusiones públicas y canales de WhatsApp
        if (chatJid === 'status@broadcast' || chatJid.endsWith('@newsletter')) {
          continue;
        }

        const mediaType = msg.media_type || '';
        const isMedia = mediaType === 'image' || mediaType === 'audio' || mediaType === 'voice' || mediaType === 'document' || mediaType === 'sticker';

        if ((!msg.content || !msg.content.trim()) && !isMedia) continue;
        if (processedMessageIds.has(msg.id)) continue;
        processedMessageIds.add(msg.id);

        const isMyOwnChat = chatJid === MY_PHONE_JID || chatJid.startsWith('5213325094748');
        const isGroup = chatJid.endsWith('@g.us');
        const isFromAngel = msg.is_from_me === 1 || (msg.sender || '').includes('3325094748') || chatJid.includes('3325094748');
        const isFromErika = (msg.sender || '').includes('6311152237');

        let contactName = '';
        try {
          const chatRow = db.prepare('SELECT name FROM chats WHERE jid = ?').get(chatJid);
          contactName = chatRow?.name || '';
        } catch {}

        // Detección de respuesta/cita directa al bot (quoted_message_id)
        const quotedMessageId = msg.quoted_message_id || '';
        const quotedParticipant = msg.quoted_participant || '';
        let isQuotedToBot = false;

        if (quotedMessageId) {
          if (isMyOwnChat) {
            isQuotedToBot = true;
          } else {
            // En chats de terceros (grupos o chats con Erika), citar un mensaje SOLO activa al bot si:
            // 1. El mensaje citado fue realmente emitido por el bot (registrado en sent_messages)
            // 2. Y el mensaje que cita NO es pura reacción humana / risa entre la pareja (jaja, xd, lo amo, etc.)
            const isBotSent = (typeof antiEcho.hasSentId === 'function' && antiEcho.hasSentId(quotedMessageId));
            if (isBotSent) {
              const cleanContent = (msg.content || '').toLowerCase().trim();
              const isJustReaction = /^(?:(?:ja|je|xd|lol|jaja|jajaja|lo\s+amo|loamoo+|omg|no\s+mames|ay\s+no|🤣|😂|❤️|✨)\s*)+$/i.test(cleanContent);
              if (!isJustReaction) {
                isQuotedToBot = true;
              }
            }
          }
        }

        const context = {
          msg,
          text: (msg.content || '').trim(),
          chatJid,
          sender: msg.sender || '',
          senderName: isFromAngel ? 'Angel' : (isFromErika ? 'Erika' : (contactName || 'Compañero')),
          contactName,
          isGroup,
          isFromAngel,
          isFromErika,
          isMyOwnChat,
          isImage: mediaType === 'image',
          isSticker: mediaType === 'sticker',
          isAudio: mediaType === 'audio' || mediaType === 'voice',
          isDocument: mediaType === 'document',
          quotedMessageId,
          quotedParticipant,
          isQuotedToBot
        };

        // Ejecución desacoplada en el pipeline
        await messagePipeline.execute(context);
      }
    } catch (err) {
      if (!err.message.includes('busy')) console.error('Error SQLite:', err.message);
    }
  }, 1200);

  // Tareas programadas periódicas (Briefing, Finanzas, Auditoría)
  setInterval(async () => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
      const p = {}; for (const part of parts) p[part.type] = part.value;
      const todayStr = `${p.year}-${p.month}-${p.day}`;
      const isWeekend = now.getDay() === 0 || now.getDay() === 6;
      const targetHour = isWeekend ? 10 : 8;
      const currentHour = parseInt(p.hour, 10);

      // Verificación de si el briefing ya fue despachado hoy (en memoria o en base de datos)
      let briefingSentToday = lastBriefingDate === todayStr;
      if (!briefingSentToday && db) {
        try {
          const sentRow = db.prepare(
            "SELECT 1 FROM messages WHERE chat_jid = ? AND content LIKE '%¡Buenos días, Ángel!%' AND timestamp LIKE ? LIMIT 1"
          ).get(MY_PHONE_JID, `${todayStr}%`);
          if (sentRow) {
            briefingSentToday = true;
            lastBriefingDate = todayStr;
          }
        } catch {}
      }

      // Ventana matutina con auto-recuperación (Catch-Up):
      // Si ya pasó la hora objetivo (>= 8am entre semana, >= 10am fin de semana) pero aún es mañana (< 13hrs)
      // y la Mac estuvo en reposo/dormida a las 8:00am, se despacha automáticamente al despertar.
      if (!briefingSentToday && currentHour >= targetHour && currentHour < 13) {
        lastBriefingDate = todayStr;
        console.log(`🌅 [DAILY BRIEFING] Disparando briefing matutino (Hora: ${p.hour}:${p.minute}, Objetivo: ${targetHour}:00)...`);
        await sendMorningBriefing();
      }

      // Reporte financiero semanal dominical (con ventana de 20:00 a 22:59)
      if (now.getDay() === 0 && currentHour >= 20 && currentHour < 23 && lastFinanceReportDate !== todayStr) {
        lastFinanceReportDate = todayStr;
        const report = await financeReport.generateWeeklyReport();
        if (report?.message) await sendMessage(MY_PHONE_JID, report.message);
      }

      // Auditoría nocturna de Notion (03:30)
      if (currentHour >= 3 && currentHour < 5 && lastAuditDate !== todayStr) {
        lastAuditDate = todayStr;
        await secondBrainAuditor.runFullAudit(true, true);
      }

      // Proactive Pulse & Heartbeat Predictivo (Deadlines, Clases CUCEA, Salud Batería)
      await proactivePulseEngine.pulse();
    } catch (err) {
      console.error('Error en cron periódico/proactivo:', err.message);
    }
  }, 25000);

  // Escáner de Classroom cada 15m
  const syncClassroomScript = path.join(__dirname, '../classroom-sync/sync-announcements.js');
  const runClassroomScan = () => {
    const currentHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false }), 10);
    if (currentHour >= 7 && currentHour <= 22) {
      exec(`/Users/angelzaragoza/.nvm/versions/node/v24.11.1/bin/node "${syncClassroomScript}"`, () => {});
    }
  };
  setTimeout(runClassroomScan, 15000);
  setInterval(runClassroomScan, 15 * 60 * 1000);
}

initWatcher();
