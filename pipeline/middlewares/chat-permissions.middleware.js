const os = require('os');
const mcpClient = require('../../mcp-client.js');
const permissions = require('../../modules/permissions/chat-permissions.js');

const DASHBOARD_PORT = parseInt(process.env.DASHBOARD_PORT || '8767', 10) || 8767;

/**
 * Detecta el comando para pedir el link del panel.
 * Soporta: !panel, /panel, !admin, /admin, "panel", "quiero administrar",
 * "panel de control", "pasame el link", "pasa el link", "link del panel".
 */
const PANEL_COMMAND_REGEX = /^(?:[!/]\s*(?:panel|admin)\b|panel\b|quiero\s+administrar|panel\s+de\s+control|pasa(?:me)?\s+el\s+link|link\s+del\s+panel)/i;

function isPanelCommand(text) {
  if (!text) return false;
  return PANEL_COMMAND_REGEX.test(String(text).trim());
}

function getLocalIp() {
  try {
    const ifaces = os.networkInterfaces();
    // Preferir en0/en1 (Wi-Fi en Mac), luego cualquier IPv4 no interna
    const candidates = [];
    for (const [name, addrs] of Object.entries(ifaces)) {
      for (const a of addrs || []) {
        if (a.family === 'IPv4' && !a.internal) {
          candidates.push({ name, address: a.address });
        }
      }
    }
    if (candidates.length === 0) return '127.0.0.1';
    const wifi = candidates.find((c) => c.name === 'en0' || c.name === 'en1');
    if (wifi) return wifi.address;
    const lan = candidates.find((c) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./.test(c.address));
    return (lan || candidates[0]).address;
  } catch {
    return '127.0.0.1';
  }
}

function buildPanelMessage() {
  const ip = getLocalIp();
  return (
    `🎛️ *Panel de Control Antigravity*\n` +
    `Puedes administrar la autonomía y permisos de tus chats aquí:\n` +
    `💻 *En tu Mac:* http://localhost:${DASHBOARD_PORT}\n` +
    `📱 *En tu celular (mismo Wi-Fi):* http://${ip}:${DASHBOARD_PORT}\n` +
    `_Ahí puedes prender, apagar o poner en modo silencioso cualquier grupo o chat :3_`
  );
}

/**
 * pipeline/middlewares/chat-permissions.middleware.js
 * Se posiciona justo después de antiEchoMiddleware:
 *  1. Atiende !panel/!admin aunque el chat esté en SILENT o el bot pausado.
 *  2. Aplica killswitch global.
 *  3. Aplica SILENT (drop total).
 *  4. Inyecta ctx.permissions para que media/passive/gatekeeper respeten flags.
 */
module.exports = function createChatPermissionsMiddleware(deps = {}) {
  const antiEcho = deps.antiEcho || null;
  const replyFn = deps.sendReply || ((...args) => mcpClient.sendReply(...args));
  const sendFn = deps.sendMessage || ((...args) => mcpClient.sendMessage(...args));
  const perms = deps.permissions || permissions;

  return async function chatPermissionsMiddleware(ctx, next) {
    const { text, chatJid, sender, isGroup, msg } = ctx;
    const contactName = ctx.contactName || '';

    let permission;
    try {
      permission = perms.getChatPermission(chatJid, contactName);
    } catch {
      permission = { chat_jid: chatJid, autonomy_mode: 'MENTIONS_ONLY', allow_notion: 1, allow_media: 1 };
    }
    ctx.permissions = permission;

    const fromAngel = !!(ctx.isFromAngel || ctx.isMyOwnChat);
    const wantsPanel = isPanelCommand(text);

    // 1. Comando del panel: siempre responde a Ángel, incluso en SILENT o con killswitch.
    if (wantsPanel && fromAngel) {
      const panelMsg = deps.buildPanelMessage ? deps.buildPanelMessage() : buildPanelMessage();
      try {
        if (antiEcho && typeof antiEcho.remember === 'function') antiEcho.remember(panelMsg);
        if (ctx.isMyOwnChat || !isGroup) {
          await sendFn(chatJid, panelMsg);
        } else {
          await replyFn(chatJid, panelMsg, msg.id, isGroup ? sender : '');
        }
      } catch (err) {
        console.error('[CHAT-PERMISSIONS] Error enviando link del panel:', err.message);
      }
      return; // consumido
    }

    // 2. Killswitch global: pausa todo salvo el comando del panel (ya atendido arriba).
    let globalOn = true;
    try {
      globalOn = typeof perms.isGlobalEnabled === 'function' ? perms.isGlobalEnabled() : true;
    } catch {
      globalOn = true;
    }
    ctx.globalEnabled = globalOn;
    if (!globalOn) {
      return; // aborto silencioso
    }

    // 3. SILENT: descarte total del turno.
    if (permission && permission.autonomy_mode === 'SILENT') {
      return;
    }

    await next();
  };
};

module.exports.isPanelCommand = isPanelCommand;
module.exports.getLocalIp = getLocalIp;
module.exports.buildPanelMessage = buildPanelMessage;
module.exports.DASHBOARD_PORT = DASHBOARD_PORT;
