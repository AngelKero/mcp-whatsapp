/**
 * pipeline/ack.js
 * Ciclo de acuse visual de turno (spec ack-reactions):
 *   montar 👀 + typing al abrir el turno, limpiar 👀 en finally.
 * Montaje concurrente (Promise.allSettled) y fail-open: ningún fallo de
 * reacción/typing interrumpe la inferencia ni el envío.
 * `deps` inyectable para tests: { sendReactionFn, sendTypingFn, log }.
 */
async function mountAckReaction(deps, { chatJid, msgId, senderJid = '', isGroup = false }) {
  const sender = isGroup ? senderJid : '';
  const log = deps.log || (() => {});
  await Promise.allSettled([
    (async () => {
      try {
        await deps.sendReactionFn(chatJid, msgId, '👀', sender);
      } catch (err) {
        log('ack mount omitido:', err && err.message);
      }
    })(),
    (async () => {
      try {
        await deps.sendTypingFn(chatJid, true);
      } catch {}
    })()
  ]);
}

async function clearAckReaction(deps, { chatJid, msgId, senderJid = '', isGroup = false }) {
  const sender = isGroup ? senderJid : '';
  const log = deps.log || (() => {});
  try {
    await deps.sendReactionFn(chatJid, msgId, '', sender);
  } catch (err) {
    log('ack cleanup omitido:', err && err.message);
  }
}

/**
 * Envuelve un turno: monta el acuse sin esperar (cero latencia añadida) y
 * limpia en finally tras éxito o error. El error de fn se propaga intacto.
 */
async function withAckReaction(deps, ctx, fn) {
  mountAckReaction(deps, ctx).catch(() => {});
  try {
    return await fn();
  } finally {
    await clearAckReaction(deps, ctx);
  }
}

module.exports = {
  mountAckReaction,
  clearAckReaction,
  withAckReaction
};
