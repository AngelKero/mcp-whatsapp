const sessionManager = require('../../session-manager.js');

const BOT_PHRASES_BLACKLIST = [
  '¡de nada, angel!',
  '¡de nada!',
  '¡con gusto! ✨',
  '¡con gusto!',
  '¡hasta luego,',
  'aquí andamos para lo que ocupes',
  'aqui andamos para lo que ocupes',
  'sale :3',
  'xd :3',
  '¡entendido! 👍',
  '¡entendido!',
  '¡hola angel! tuve un detalle',
  '¡hola erika! tuve un detalle',
  '⏰ *¡recordatorio notion!*',
  '🔥 *alerta de vencimiento',
  '⏳ *aviso preventivo',
  '💰 *balancín financiero',
  '📌 *[notion copilot',
  '💡 *[sugerencia detectada',
  '📢 *[aviso escolar',
  '🚨 ¡aviso de clase',
  '🛑 *aviso de salida',
  '🌅 *¡buenos días',
  '*qué onda ángel, buen día',
  'qué onda ángel, buen día',
  '🪫 *alerta de hardware',
  '🔋 *alerta de hardware',
  '⚠️ *alerta de hardware',
  '[confianza:',
  '💸 *[comprobante',
  '🔔 *recordatorio agendado',
  '✅ *tarea registrada',
  'x antigravity bot x',
  'x bot x',
  '*¡meneando la chapa',
  'oye angel, ya casi es hora de jalar',
  'ojo angel, te quedan como 2 horas',
  'ojo angel, traes',
  'oye angel, para que lo tengas en el radar',
  'oye angel, acuérdate de esto:',
  'oye, a tu macbook air',
  'anoté la tarea:',
  'anoté el gasto:',
  'anotado para',
  'anotado en date planning:',
  'guardé la nota:',
  'listo angel, ya puse a grabar',
  'ya quedaron listos los apuntes'
];

module.exports = function createAntiEchoMiddleware(antiEcho, botSentTexts) {
  return async function antiEchoMiddleware(ctx, next) {
    const { msg, text, chatJid, isMyOwnChat, isQuotedToBot } = ctx;

    // 1. Interceptar cualquier mensaje saliente del bot por ID registrado en sent_messages
    if (msg.id && typeof antiEcho.hasSentId === 'function' && antiEcho.hasSentId(msg.id)) {
      console.log(`🛑 [ANTI-ECHO] Mensaje saliente del bot interceptado por ID (${msg.id}).`);
      return;
    }

    // 2. Interceptar stickers salientes del bot registrados por ID o hash
    if (msg.media_type === 'sticker' && msg.id && typeof antiEcho.consumeSticker === 'function' && antiEcho.consumeSticker(msg.id)) {
      console.log(`🛑 [ANTI-ECHO] Sticker saliente del bot interceptado por ID (${msg.id}).`);
      return;
    }

    // 3. Interceptar firmas de texto salientes del bot (aplica para cualquier chat)
    if (antiEcho.consume(text) || botSentTexts.has(text)) {
      botSentTexts.delete(text);
      return;
    }

    // 4. Blacklist estático de frases y firmas del bot (evita bucles incluso si antiEcho o DB se reinician)
    const cleanLower = (text || '').toLowerCase().trim();
    if (BOT_PHRASES_BLACKLIST.some(phrase => cleanLower.startsWith(phrase) || cleanLower.includes(phrase))) {
      return;
    }

    // 5. Ignorar mensajes salientes de Ángel a otros chats (is_from_me = 1 && !isMyOwnChat)
    // EXCEPTO si Ángel está invocando al bot explícitamente (!ia, gemini, etc.) o citando al bot (isQuotedToBot).
    // Eliminamos isSessionActive aquí para blindar contra auto-respuestas y evitar que pláticas normales con Erika activen la IA.
    if (msg.is_from_me === 1 && !isMyOwnChat) {
      const isExplicitBotCall = (
        cleanLower.startsWith('!ia') ||
        cleanLower.startsWith('!ai') ||
        cleanLower.startsWith('/ia') ||
        cleanLower.startsWith('/ai') ||
        cleanLower.startsWith('!jarvis') ||
        cleanLower.startsWith('/jarvis') ||
        cleanLower.startsWith('!gemini') ||
        cleanLower.startsWith('/gemini') ||
        cleanLower.includes('@antigravity') ||
        cleanLower.includes('antigravity') ||
        cleanLower.includes('@jarvis') ||
        cleanLower.includes('jarvis') ||
        cleanLower.includes('@gemini') ||
        cleanLower.includes('gemini')
      );

      if (!isExplicitBotCall && !isQuotedToBot) {
        return;
      }
    }

    await next();
  };
};
