/**
 * pipeline/middlewares/chat-memory.middleware.js
 * Memoria factual por chat: comandos explícitos, inyección pre-turno y
 * extracción post-turno. Posición: justo después de chat-permissions,
 * antes de media-extractor (la inyección debe preceder a cualquier LLM).
 *
 * Comandos (dueño en grupos, todos en 1:1 — misma regla que !buscar):
 *   !recordar <dato>   guarda verbatim (bypass del gate) y auto-activa memoria
 *   !memoria            lista hasta 8 hechos
 *   !olvidar <texto>    muestra el mejor match y espera "sí" (una confirmación)
 *   !olvidar todo       doble confirmación, borrado suave de todo el chat
 *   !reset-memoria      alias de !olvidar todo
 *
 * Fail-open: cualquier error llama next() sin romper el turno.
 */
const mcpClient = require('../../mcp-client.js');
const { memoryKeyFor } = require('../memory-store.js');
const extract = require('../memory-extract.js');

const CMD_RE = /^[!/]\s*(recordar|memoria|olvidar|reset-memoria)\b/i;
const YES_RE = /^(s[ií]|si|confirmar|confirmo|dale|va|b[oó]rralo|hazlo)(?![a-záéíóúñü])/i;
const NO_RE = /^(no|nada|cancela(?:r)?|d[eé]jalo|olv[ií]dalo|nel)(?![a-záéíóúñü])/i;
const PENDING_TTL_MS = 5 * 60 * 1000;

function parseCommand(text) {
  const t = String(text || '').trim();
  const m = t.match(CMD_RE);
  if (!m) return null;
  const cmd = m[1].toLowerCase();
  const arg = t.slice(m[0].length).trim();
  return { cmd, arg };
}

module.exports = function createChatMemoryMiddleware(deps = {}) {
  let store = deps.store || null; // perezoso: no abrir messages.db en arranque
  const replyFn = deps.sendReply || ((chatJid, body, msgId, senderJid = '') =>
    mcpClient.sendReplyOrFallback(chatJid, body, { messageId: msgId, senderJid, isGroup: !!senderJid }));
  const ownSendFn = deps.sendMessage || ((...args) => mcpClient.sendMessage(...args));
  const antiEcho = deps.antiEcho || null;
  const gateFn = deps.gateFn; // opcional: classifyTaskActionability (rescate nivel 2)
  const pending = new Map(); // memKey -> { step, fact?, matches?, expires }

  function getStore() {
    if (!store) store = require('../memory-store.js').getMemoryStore();
    return store;
  }

  function getPending(memKey) {
    const p = pending.get(memKey);
    if (!p) return null;
    if (Date.now() > p.expires) {
      pending.delete(memKey);
      return null;
    }
    return p;
  }

  async function say(chatJid, msg, ctx) {
    try {
      if (antiEcho && typeof antiEcho.remember === 'function') antiEcho.remember(msg);
      if (ctx.isMyOwnChat) {
        await ownSendFn(chatJid, msg);
      } else {
        await replyFn(chatJid, msg, ctx.msg.id, ctx.isGroup ? ctx.sender : '');
      }
    } catch (err) {
      console.error('[CHAT-MEMORY] Error respondiendo:', err.message);
    }
  }

  async function handleRecordar(ctx, memKey, dato) {
    if (!dato) {
      await say(ctx.chatJid, '¿Qué quieres que recuerde? Escríbelo así: `!recordar mi hijo se llama Mateo` :3', ctx);
      return;
    }
    let facts = extract.extractFacts(dato);
    if (facts.length === 0) {
      facts = [{ key: extract.cleanKey(dato.split(/\s+/).slice(0, 4).join(' ')), value: extract.cleanVal(dato), category: 'fact' }];
    }
    for (const f of facts.slice(0, 3)) {
      // eslint-disable-next-line no-await-in-loop
      await getStore().saveFact({ memKey, key: f.key, value: f.value, category: f.category, scope: ctx.isGroup ? 'group' : 'self', sourceMsgId: ctx.msg.id });
    }
    if (!getStore().isEnabledFor(ctx.chatJid, ctx.sender)) {
      await getStore().setChatEnabled(ctx.chatJid, ctx.sender, true);
    }
    const shown = facts.slice(0, 3).map((f) => `• ${f.key}: ${f.value}`).join('\n');
    await say(ctx.chatJid, `🧠 Anotado para este chat:\n${shown}\n_Lo recordaré aunque se abra una nueva sesión :3_`, ctx);
  }

  async function handleMemoria(ctx, memKey, forGroup) {
    const facts = forGroup
      ? getStore().getGroupFacts(ctx.chatJid, { limit: 8 })
      : getStore().getFacts(memKey, { limit: 8 });
    if (facts.length === 0) {
      await say(ctx.chatJid, 'Aún no recuerdo nada de este chat. Usa `!recordar <dato>` o el botón ✨ Generar contexto del panel :3', ctx);
      return;
    }
    const lines = facts.map((f) => `• ${f.fact_key}: ${f.value}`).join('\n');
    await say(ctx.chatJid, `🧠 *Lo que recuerdo de este chat:*\n${lines}`, ctx);
  }

  async function handleOlvidar(ctx, memKey, arg, forGroup) {
    const listFacts = () => (forGroup
      ? getStore().getGroupFacts(ctx.chatJid, { limit: 100 })
      : getStore().getFacts(memKey, { limit: 100 }));
    if (/^todo$/i.test(arg)) {
      const n = listFacts().length;
      if (n === 0) {
        await say(ctx.chatJid, 'No hay nada que olvidar en este chat :3', ctx);
        return;
      }
      pending.set(memKey, { step: 'clear-1', expires: Date.now() + PENDING_TTL_MS });
      await say(ctx.chatJid, `⚠️ Vas a borrar *${n} recuerdos* de este chat. ¿Seguro? Responde *sí* para confirmar (paso 1 de 2).`, ctx);
      return;
    }
    if (!arg) {
      await say(ctx.chatJid, 'Dime qué olvido: `!olvidar <texto>` o `!olvidar todo` para borrar todo.', ctx);
      return;
    }
    const matches = getStore().searchFacts(memKey, arg, 3);
    if (matches.length === 0) {
      await say(ctx.chatJid, `No encontré nada parecido a "${arg}" en mi memoria de este chat.`, ctx);
      return;
    }
    const top = matches[0];
    pending.set(memKey, { step: 'delete-1', fact: top, expires: Date.now() + PENDING_TTL_MS });
    await say(ctx.chatJid, `¿Borramos esto?\n• ${top.fact_key}: ${top.value}\nResponde *sí* para confirmar o *no* para dejarlo.`, ctx);
  }

  async function handlePending(ctx, memKey, text) {
    const p = getPending(memKey);
    if (!p) return false;
    const t = String(text || '').trim();
    if (NO_RE.test(t)) {
      pending.delete(memKey);
      await say(ctx.chatJid, 'Va, no borro nada :3', ctx);
      return true;
    }
    if (!YES_RE.test(t)) return false;
    if (p.step === 'delete-1') {
      await getStore().deleteFact(p.fact.id);
      pending.delete(memKey);
      await say(ctx.chatJid, `🗑️ Olvidado: ${p.fact.fact_key}.`, ctx);
      return true;
    }
    if (p.step === 'clear-1') {
      pending.set(memKey, { step: 'clear-2', expires: Date.now() + PENDING_TTL_MS });
      await say(ctx.chatJid, '⚠️ Última oportunidad: responde *sí* otra vez para borrar TODO (paso 2 de 2).', ctx);
      return true;
    }
    if (p.step === 'clear-2') {
      const n = await getStore().clearFacts(memKey);
      pending.delete(memKey);
      await say(ctx.chatJid, `🗑️ Borrados ${n} recuerdos de este chat. Empezamos de cero :3`, ctx);
      return true;
    }
    return false;
  }

  function scheduleExtraction(ctx, memKey) {
    // Fire-and-forget post-turno: nunca bloquea ni rompe el pipeline.
    setImmediate(async () => {
      try {
        if (!getStore().isEnabledFor(ctx.chatJid, ctx.sender)) return;
        const text = String(ctx.text || '');
        let facts = extract.extractFacts(text);
        if (facts.length === 0 && gateFn) {
          const rescued = await extract.rescueWithGate(text, gateFn);
          if (rescued) facts = [rescued];
        }
        for (const f of facts.slice(0, 3)) {
          // eslint-disable-next-line no-await-in-loop
          await getStore().saveFact({
            memKey, key: f.key, value: f.value, category: f.category,
            scope: ctx.isGroup ? 'group' : 'self', sourceMsgId: ctx.msg.id
          });
        }
        if (facts.length > 0) console.log(`🧠 [CHAT-MEMORY] ${facts.length} hecho(s) guardados en ${memKey}`);
      } catch (err) {
        console.error('[CHAT-MEMORY] Extracción fallida (fail-open):', err.message);
      }
    });
  }

  return async function chatMemoryMiddleware(ctx, next) {
    const { text, chatJid, sender, isGroup } = ctx;
    // Misma regla de autorización que !buscar: en grupos solo Ángel.
    if (isGroup && !ctx.isFromAngel) {
      await next();
      return;
    }
    let memKey = null;
    try {
      memKey = memoryKeyFor(chatJid, sender);
    } catch {
      memKey = null;
    }
    if (!memKey) {
      await next();
      return;
    }

    try {
      // 0. Confirmaciones pendientes (sí/no) tienen prioridad sobre comandos.
      if (await handlePending(ctx, memKey, text)) return;

      // 1. Comandos explícitos consumen el turno.
      const parsed = parseCommand(text);
      if (parsed) {
        const forGroup = !!isGroup;
        if (parsed.cmd === 'recordar') await handleRecordar(ctx, memKey, parsed.arg);
        else if (parsed.cmd === 'memoria') await handleMemoria(ctx, memKey, forGroup);
        else if (parsed.cmd === 'olvidar') await handleOlvidar(ctx, memKey, parsed.arg, forGroup);
        else if (parsed.cmd === 'reset-memoria') await handleOlvidar(ctx, memKey, 'todo', forGroup);
        return;
      }

      // 2. Inyección pre-turno para que el LLM vea el contexto del chat.
      try {
        const block = getStore().getTurnContextFor(chatJid, sender, String(text || ''));
        if (block) ctx.memoryContext = block;
      } catch {}

      await next();

      // 3. Extracción post-turno (no bloquea).
      scheduleExtraction(ctx, memKey);
    } catch (err) {
      console.error('[CHAT-MEMORY] Error (fail-open):', err.message);
      try {
        await next();
      } catch {}
    }
  };
};

module.exports.parseMemoryCommand = parseCommand;
