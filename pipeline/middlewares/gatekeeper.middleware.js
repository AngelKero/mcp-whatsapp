const { sendReply, sendMessage } = require('../../mcp-client.js');
const sessionManager = require('../../session-manager.js');
const {
  classifyBotMention,
  classifyClosingMessage,
  detectHumanAddressee,
  classifyLurkIntervention
} = require('../../system-one-client.js');
const { isMarketplaceChat, isExplicitMarketplaceRequest } = require('../../config/marketplace-filter.js');

/**
 * pipeline/middlewares/gatekeeper.middleware.js
 * Implementa la Máquina de Estados Adaptativa para Turn-Taking y Escucha Ambiental (Chismoso Inteligente).
 * Estados:
 *   - IDLE: Ignora pláticas ajenas hasta invocación explícita o cita al bot.
 *   - ACTIVE: Ventana caliente (0-90s) para turnos conversacionales continuos directos.
 *   - LURK_MODE: Modo chismoso (90s-15m). Guarda en ambient_buffer y clasifica con Laya-MLX en GPU Metal.
 */
module.exports = function createGatekeeperMiddleware(antiEcho, chatQueue) {
  return async function gatekeeperMiddleware(ctx, next) {
    const { text, chatJid, sender, isGroup, isMyOwnChat, senderName, isQuotedToBot } = ctx;

    // Permiso por chat (Panel 8767): SILENT ya se descarta aguas arriba; doble guard aquí.
    const autonomyMode = ctx.permissions?.autonomy_mode || null;
    if (autonomyMode === 'SILENT') {
      return;
    }

    const sessionState = sessionManager.getSessionState(chatJid);

    // 0. Filtro estricto para Grupos / Chats de Compra, Venta, Bazares, Tianguis y Publicidad
    // Regla del usuario: "dejalos fuera, ni les hagas caso a menos que por ejemplo te pida que busques algo o explicitamente te pida algo"
    const isMarketplace = isMarketplaceChat(chatJid, ctx.contactName);
    if (isMarketplace) {
      if (sessionState.state !== 'IDLE') {
        sessionManager.closeSession(chatJid);
      }

      const isAllowedExplicitRequest = isExplicitMarketplaceRequest(text, ctx.isFromAngel);
      if (!isAllowedExplicitRequest) {
        // En grupos de ventas, ignorar por completo a otros miembros y pláticas ajenas
        await next();
        return;
      }

      console.log(`🎯 [MARKETPLACE EXCEPCIÓN] Petición explícita de Ángel en chat de ventas (${chatJid}): "${text}"`);
      sessionManager.setSessionState(chatJid, 'ACTIVE', senderName);
      chatQueue.enqueue(chatJid, {
        msg: ctx.msg,
        text,
        senderName,
        isGroup,
        isFromAngel: ctx.isFromAngel,
        isFromErika: ctx.isFromErika,
        isMyOwnChat,
        contactName: ctx.contactName,
        isMarketplace: true
      });
      return;
    }

    // 1. Cierre voluntario de sesión ("adiós", "bye", "gracias", "a mimir")
    if (sessionState.state !== 'IDLE' && (await sessionManager.isClosingMessage(text))) {
      sessionManager.closeSession(chatJid);
      console.log(`👋 [SESIÓN IA] Sesión cerrada voluntariamente en ${chatJid} por "${text}"`);
      const byeReply = ctx.isFromAngel
        ? '¡De nada, Angel! Aquí andamos para lo que ocupes :3'
        : `¡Hasta luego, ${senderName}! Que tengas un excelente día ✨`;
      antiEcho.remember(byeReply);
      if (isMyOwnChat || !isGroup) {
        const sentRes = await sendMessage(chatJid, byeReply);
        const sentId = sentRes?.ID || sentRes?.id;
        if (sentId && typeof antiEcho.recordSentMessage === 'function') {
          antiEcho.recordSentMessage(sentId, chatJid, byeReply);
        }
      } else {
        const sentRes = await sendReply(chatJid, byeReply, ctx.msg.id, isGroup ? sender : '');
        const sentId = sentRes?.ID || sentRes?.id;
        if (sentId && typeof antiEcho.recordSentMessage === 'function') {
          antiEcho.recordSentMessage(sentId, chatJid, byeReply);
        }
      }
      return;
    }

    // 2. Chat propio (Note-to-Self) siempre está en ACTIVE para Ángel
    if (isMyOwnChat) {
      chatQueue.enqueue(chatJid, {
        msg: ctx.msg,
        text,
        senderName,
        isGroup,
        isFromAngel: ctx.isFromAngel,
        isFromErika: ctx.isFromErika,
        isMyOwnChat,
        contactName: ctx.contactName
      });
      return;
    }

    // 3. Verificación de Invocación Explícita (!ia, @antigravity) o Cita Directa al Bot
    const isMentioningBot = await classifyBotMention(text);
    const isExplicitTrigger = isMentioningBot || !!isQuotedToBot;

    if (isExplicitTrigger) {
      console.log(`🎯 [TURN-TAKING] Invocación detectada en ${chatJid} (mención: ${isMentioningBot}, cita: ${!!isQuotedToBot})`);
      sessionManager.setSessionState(chatJid, 'ACTIVE', senderName);
      chatQueue.enqueue(chatJid, {
        msg: ctx.msg,
        text,
        senderName,
        isGroup,
        isFromAngel: ctx.isFromAngel,
        isFromErika: ctx.isFromErika,
        isMyOwnChat,
        contactName: ctx.contactName
      });
      return;
    }

    // 4. Evaluación según la fase de la máquina de estados
    if (sessionState.state === 'IDLE') {
      if (autonomyMode === 'AUTONOMOUS') {
        // En modo AUTONOMOUS, promover automáticamente a LURK_MODE para registrar y evaluar intervenciones
        sessionManager.setSessionState(chatJid, 'LURK_MODE', senderName);
        sessionState.state = 'LURK_MODE';
      } else {
        // Estado IDLE en chats no autónomos: dejar pasar a middlewares pasivos
        await next();
        return;
      }
    }

    if (sessionState.state === 'ACTIVE') {
      // Ventana caliente (<90s). Verificar si el usuario cambió el destinatario a otro humano
      if (detectHumanAddressee(text)) {
        console.log(`🤫 [TURN-TAKING] Vocativo a otro humano detectado en ACTIVE (${chatJid}) -> Degenerando a LURK_MODE`);
        sessionManager.setSessionState(chatJid, 'LURK_MODE', senderName);
        sessionManager.recordAmbientMessage(chatJid, ctx.msg?.id, sender, senderName, text);
        await next();
        return;
      }

      // Turno continuo directo con la IA dentro de los 90 segundos
      sessionManager.updateActivity(chatJid);
      chatQueue.enqueue(chatJid, {
        msg: ctx.msg,
        text,
        senderName,
        isGroup,
        isFromAngel: ctx.isFromAngel,
        isFromErika: ctx.isFromErika,
        isMyOwnChat,
        contactName: ctx.contactName
      });
      return;
    }

    if (sessionState.state === 'LURK_MODE') {
      // Modo Chismoso (90s a 15 min): Almacenar en buffer pasivo de SQLite
      sessionManager.recordAmbientMessage(chatJid, ctx.msg?.id, sender, senderName, text);

      // Si se dirige a otro humano, forzar silencio de inmediato
      if (detectHumanAddressee(text)) {
        await next();
        return;
      }

      // MENTIONS_ONLY: sin intervenciones proactivas, solo invocación explícita despierta.
      if (autonomyMode === 'MENTIONS_ONLY') {
        await next();
        return;
      }

      // Evaluar con Laya-MLX en GPU Metal si el usuario formuló una pregunta que requiere al asistente
      const ambientContext = sessionManager.getAmbientContext(chatJid, 8);
      const intervention = await classifyLurkIntervention(ambientContext, text);

      if (intervention.action === 'CHIME_IN') {
        console.log(`💡 [TURN-TAKING] Laya-MLX activó intervención en LURK_MODE (${chatJid}) con confianza ${intervention.confidence}`);
        sessionManager.setSessionState(chatJid, 'ACTIVE', senderName);
        chatQueue.enqueue(chatJid, {
          msg: ctx.msg,
          text,
          senderName,
          isGroup,
          isFromAngel: ctx.isFromAngel,
          isFromErika: ctx.isFromErika,
          isMyOwnChat,
          contactName: ctx.contactName
        });
        return;
      }

      // Silencio inteligente: permanece callado y permite el paso a middlewares pasivos
      await next();
      return;
    }

    await next();
  };
};
