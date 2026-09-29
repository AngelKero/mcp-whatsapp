const http = require('http');

const MCP_URL = process.env.WHATSAPP_MCP_URL || 'http://127.0.0.1:8765/mcp';
const url = new URL(MCP_URL);

let cachedSessionId = null;
let initPromise = null;

function rawPost(bodyObj, sessionId = null) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(bodyObj);
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'X-Rate-Limit-Override': 'true'
    };
    if (sessionId) {
      headers['mcp-session-id'] = sessionId;
    }

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: headers,
      timeout: 30000
    }, (res) => {
      const newSid = res.headers['mcp-session-id'];
      if (newSid) {
        cachedSessionId = newSid;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let clean = data.trim();
        if (clean.startsWith('data: ')) {
          clean = clean.replace(/^data:\s*/, '');
        }

        try {
          const parsed = JSON.parse(clean);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data: parsed, sessionId: cachedSessionId });
          } else {
            reject(new Error(`MCP HTTP [${res.statusCode}]: ${clean}`));
          }
        } catch (e) {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, data: clean, sessionId: cachedSessionId });
          } else {
            reject(new Error(`MCP HTTP [${res.statusCode}]: ${clean}`));
          }
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout conectando a whatsapp-mcp'));
    });

    req.write(postData);
    req.end();
  });
}

async function ensureSession() {
  if (cachedSessionId) return cachedSessionId;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const initRes = await rawPost({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'cucea-automations', version: '1.0' }
      }
    });

    const sid = initRes.sessionId || initRes.headers?.['mcp-session-id'];
    if (!sid) {
      throw new Error('No se recibió mcp-session-id en initialize');
    }
    cachedSessionId = sid;
    initPromise = null;
    return sid;
  })();

  return initPromise;
}

let requestId = 100;

async function callTool(name, args = {}) {
  let sid = await ensureSession();
  const reqObj = {
    jsonrpc: '2.0',
    id: ++requestId,
    method: 'tools/call',
    params: {
      name: name,
      arguments: args
    }
  };

  try {
    const res = await rawPost(reqObj, sid);
    if (res.data?.error) {
      throw new Error(`Tool Error: ${res.data.error.message || JSON.stringify(res.data.error)}`);
    }
    const result = res.data?.result;
    if (result?.isError) {
      const errText = result.content?.[0]?.text || 'Error ejecutando tool';
      throw new Error(errText);
    }
    return result;
  } catch (err) {
    // Si la sesión expiró o devolvió 404, reintentar una vez con nueva sesión
    if (err.message.includes('404') || err.message.includes('Invalid session')) {
      cachedSessionId = null;
      sid = await ensureSession();
      const res = await rawPost(reqObj, sid);
      return res.data?.result;
    }
    throw err;
  }
}

// Helpers prácticos exportados
async function getStatus() {
  const res = await callTool('get_status', {});
  const text = res.content?.[0]?.text;
  return text ? JSON.parse(text) : res;
}
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const antiEcho = require('./modules/anti-echo-tracker.js');

async function sendMessage(recipient, message) {
  let jid = String(recipient).trim();
  if (!jid.includes('@')) {
    const cleanNumber = jid.replace(/\D/g, '');
    jid = `${cleanNumber}@s.whatsapp.net`;
  }
  // Auto-registrar firma en el tracker compartido para evitar auto-respuestas en chat propio
  try {
    if (typeof message === 'string' && message.trim()) {
      antiEcho.remember(message);
    }
  } catch {}
  const res = await callTool('send_message', { recipient: jid, message });
  let parsed = res;
  try {
    const text = res?.content?.[0]?.text;
    if (text) {
      parsed = JSON.parse(text);
    }
  } catch {}

  try {
    const sentId = parsed?.ID || parsed?.id;
    if (sentId) {
      antiEcho.recordSentMessage(sentId, jid, message);
    }
  } catch {}

  return parsed;
}

async function sendReply(chatJid, body, targetMessageId, targetSenderJid = '') {
  let jid = String(chatJid).trim();
  if (!jid.includes('@')) {
    const cleanNumber = jid.replace(/\D/g, '');
    jid = `${cleanNumber}@s.whatsapp.net`;
  }
  const args = {
    chat_jid: jid,
    target_message_id: targetMessageId,
    body: body
  };
  if (targetSenderJid) {
    args.target_sender_jid = targetSenderJid;
  }
  // Auto-registrar firma en el tracker compartido
  try {
    if (typeof body === 'string' && body.trim()) {
      antiEcho.remember(body);
    }
  } catch {}
  const res = await callTool('send_reply', args);
  let parsed = res;
  try {
    const text = res?.content?.[0]?.text;
    if (text) {
      parsed = JSON.parse(text);
    }
  } catch {}

  try {
    const sentId = parsed?.ID || parsed?.id;
    if (sentId) {
      antiEcho.recordSentMessage(sentId, jid, body);
    }
  } catch {}

  return parsed;
}

async function sendReaction(recipient, messageId, emoji) {
  let jid = String(recipient).trim();
  if (!jid.includes('@')) {
    const cleanNumber = jid.replace(/\D/g, '');
    jid = `${cleanNumber}@s.whatsapp.net`;
  }
  return await callTool('send_reaction', {
    recipient: jid,
    message_id: messageId,
    emoji: emoji
  });
}

async function sendFile(recipient, mediaPath, caption = '') {
  let jid = String(recipient).trim();
  if (!jid.includes('@')) {
    const cleanNumber = jid.replace(/\D/g, '');
    jid = `${cleanNumber}@s.whatsapp.net`;
  }
  const args = {
    recipient: jid,
    media_path: mediaPath
  };
  if (caption) args.caption = caption;
  const res = await callTool('send_file', args);
  let parsed = res;
  try {
    const text = res?.content?.[0]?.text;
    if (text) {
      parsed = JSON.parse(text);
    }
  } catch {}

  try {
    const sentId = parsed?.ID || parsed?.id;
    if (sentId) {
      antiEcho.recordSentMessage(sentId, jid, caption || '');
    }
  } catch {}

  return parsed;
}

async function sendSticker(recipient, mediaPath) {
  let jid = String(recipient).trim();
  if (!jid.includes('@')) {
    const cleanNumber = jid.replace(/\D/g, '');
    jid = `${cleanNumber}@s.whatsapp.net`;
  }

  // Pre-firmar el hash del sticker antes de enviarlo
  try {
    if (fs.existsSync(mediaPath)) {
      const buf = fs.readFileSync(mediaPath);
      const fileHash = crypto.createHash('sha256').update(buf).digest('hex');
      antiEcho.rememberSticker(fileHash);
      const base = path.basename(mediaPath, path.extname(mediaPath));
      if (base) antiEcho.rememberSticker(base);
    }
  } catch (err) {
    console.error('[MCP-CLIENT] Error registrando hash anti-echo para sticker:', err.message);
  }

  const args = {
    recipient: jid,
    media_path: mediaPath
  };
  const res = await callTool('send_sticker', args);
  let parsed = res;
  try {
    const text = res?.content?.[0]?.text;
    if (text) {
      parsed = JSON.parse(text);
    }
  } catch {}

  // Registrar el message ID de WhatsApp si fue devuelto
  try {
    const sentId = parsed?.ID || parsed?.id;
    if (sentId) {
      antiEcho.recordSentMessage(sentId, jid, '');
      antiEcho.rememberSticker(sentId);
    }
  } catch {}

  return parsed;
}

async function listChats(limit = 30, query = '') {
  const args = { limit };
  if (query) args.query = query;
  const res = await callTool('list_chats', args);
  const text = res.content?.[0]?.text;
  return text ? JSON.parse(text) : res;
}

async function listGroups() {
  const res = await callTool('list_groups', {});
  const text = res.content?.[0]?.text;
  return text ? JSON.parse(text) : res;
}

async function downloadMedia(chatJid, messageId, outputPath = '') {
  let jid = String(chatJid).trim();
  if (!jid.includes('@')) {
    const cleanNumber = jid.replace(/\D/g, '');
    jid = `${cleanNumber}@s.whatsapp.net`;
  }
  const args = {
    chat_jid: jid,
    message_id: messageId
  };
  if (outputPath) {
    args.output_path = outputPath;
  }
  const res = await callTool('download_media', args);
  const text = res.content?.[0]?.text;
  return text ? JSON.parse(text) : res;
}

async function sendTyping(chatJid, active = true, kind = '') {
  let jid = String(chatJid).trim();
  if (!jid.includes('@')) {
    const cleanNumber = jid.replace(/\D/g, '');
    jid = `${cleanNumber}@s.whatsapp.net`;
  }
  const args = { chat_jid: jid, active: !!active };
  if (kind) args.kind = kind;
  try {
    return await callTool('send_typing', args);
  } catch (err) {
    // Si la presencia falla, no romper el flujo principal
    console.warn(`[MCP-CLIENT] Fallo en sendTyping para ${jid}:`, err.message);
    return null;
  }
}

/**
 * Despacho contextual (spec contextual-replies):
 * - Con messageId → `send_reply` citando el trigger (senderJid solo en grupos,
 *   omitido en 1:1 — el daemon rechaza sender en 1:1 y el participant debe ser
 *   JID teléfono, resuelto vía whatsmeow_lid_map del lado daemon).
 * - Sin messageId → `send_message` directo, sin intentar cita.
 * - Si `send_reply` falla (referencia inválida/expirada) → UN reintento en
 *   plano + log `reply-fallback`. Exactamente un mensaje entregado.
 * `deps` inyectable para tests ({ sendReplyFn, sendMessageFn }).
 */
async function sendReplyOrFallback(chatJid, body, opts = {}, deps = {}) {
  const { messageId = null, senderJid = '', isGroup = false } = opts;
  const replyFn = deps.sendReplyFn || sendReply;
  const plainFn = deps.sendMessageFn || sendMessage;
  if (!messageId) {
    return plainFn(chatJid, body);
  }
  const targetSender = isGroup ? (senderJid || '') : '';
  try {
    return await replyFn(chatJid, body, messageId, targetSender);
  } catch (err) {
    console.warn(`[MCP-CLIENT] reply-fallback a send_message en ${chatJid}:`, err.message);
    return plainFn(chatJid, body);
  }
}

module.exports = {
  callTool,
  getStatus,
  sendMessage,
  sendReply,
  sendReplyOrFallback,
  sendReaction,
  sendFile,
  sendSticker,
  sendTyping,
  listChats,
  listGroups,
  downloadMedia
};

