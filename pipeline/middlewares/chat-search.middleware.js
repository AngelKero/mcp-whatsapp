const chatHistorySearch = require('../../modules/search/chat-history-search.js');
const mcpClient = require('../../mcp-client.js');
const { classifySearchCommand } = require('../../system-one-client.js');

/**
 * pipeline/middlewares/chat-search.middleware.js
 * Intercepta solicitudes explícitas de búsqueda en el historial (!buscar o /buscar)
 * Responde inmediatamente en <50ms sin pasar por el LLM.
 */
module.exports = function createChatSearchMiddleware(antiEcho, customSendReply = null) {
  const replyFn = customSendReply || ((chatJid, body, msgId, senderJid = '') =>
    mcpClient.sendReplyOrFallback(chatJid, body, { messageId: msgId, senderJid, isGroup: !!senderJid }));

  return async function chatSearchMiddleware(ctx, next) {
    const { text, chatJid, sender, isGroup, msg, isFromAngel } = ctx;

    // En grupos, solo Ángel puede ejecutar búsquedas en su historial
    if (isGroup && !isFromAngel) {
      await next();
      return;
    }

    const term = await classifySearchCommand(text);
    if (term) {
      console.log(`🔍 [CHAT SEARCH] Consulta recibida en ${chatJid}: "${term}"`);

      const results = chatHistorySearch.search(term, 5);
      const replyMessage = chatHistorySearch.formatResults(term, results);

      antiEcho.remember(replyMessage);
      await replyFn(chatJid, replyMessage, msg.id, isGroup ? sender : '');
      return; // Detiene la propagación en el pipeline
    }

    await next();
  };
};
