const passiveExtractor = require('../../passive-extractor.js');
const { sendMessage } = require('../../mcp-client.js');
const { MY_PHONE_JID } = require('../../config/env.js');
const { isMarketplaceChat } = require('../../config/marketplace-filter.js');

/**
 * pipeline/middlewares/passive-extractor.middleware.js
 * Escucha pasivamente en chats personales para registrar gastos, citas y compromisos en Notion.
 */
module.exports = function createPassiveExtractorMiddleware() {
  return async function passiveExtractorMiddleware(ctx, next) {
    const { text, chatJid, isFromAngel, isFromErika, contactName } = ctx;

    // En chats de compra/venta/publicidad no extraer notas, gastos ni tareas
    if (isMarketplaceChat(chatJid, contactName)) {
      await next();
      return;
    }

    // Permiso modular por chat (Panel 8767): allow_notion = 0 bloquea extracción pasiva
    if (ctx.permissions && ctx.permissions.allow_notion === 0) {
      await next();
      return;
    }

    if (isFromAngel) {
      const extracted = await passiveExtractor.processMessage(text, true, ctx);
      if (extracted?.message) {
        console.log(`📌 [AUTO-EXTRACTOR] Guardado automático en Notion (${extracted.action}) desde chat ${chatJid}`);
        if (chatJid.includes('3325094748')) {
          await sendMessage(chatJid, extracted.message);
        } else {
          const origin = contactName ? `chat con *${contactName}*` : 'conversación';
          await sendMessage(MY_PHONE_JID, `📌 *[Notion Copilot • Detectado en ${origin}]*\n\n${extracted.message}`);
        }
        return;
      }
    } else if (isFromErika) {
      const extracted = await passiveExtractor.processMessage(text, false, ctx);
      if (extracted?.action === 'task_proposal') {
        console.log(`💡 [PROPOSAL-EXTRACTOR] Propuesta detectada de Polluela: "${text}"`);
        const notifyMsg = `💡 *[Sugerencia detectada de Polluela]*\n❤️ *Plan propuesto:* "${text}"\n📂 Proyecto: *Date Planning*\n\n_Para guardarlo en Notion, puedes confirmármelo por aquí._`;
        await sendMessage(MY_PHONE_JID, notifyMsg);
        return;
      }
    }

    await next();
  };
};
