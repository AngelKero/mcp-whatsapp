const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { mountAckReaction, clearAckReaction, withAckReaction } = require('../../pipeline/ack.js');

function deps(log = []) {
  return {
    calls: [],
    log: (...a) => log.push(a.join(' ')),
    async sendReactionFn(chatJid, msgId, emoji, senderJid = '') {
      this.calls.push({ fn: 'reaction', chatJid, msgId, emoji, senderJid });
      return {};
    },
    async sendTypingFn(chatJid, active) {
      this.calls.push({ fn: 'typing', chatJid, active });
      return {};
    }
  };
}

describe('ack-reactions: ciclo de acuse visual', () => {
  it('monta 👀 + typing concurrentes, con sender solo en grupos', async () => {
    const d = deps();
    const ctx = { chatJid: '12036301@g.us', msgId: 'M1', senderJid: '5219999999999@s.whatsapp.net', isGroup: true };
    await mountAckReaction(d, ctx);
    const r = d.calls.find((c) => c.fn === 'reaction');
    const t = d.calls.find((c) => c.fn === 'typing');
    assert.ok(r && t, 'ambas señales deben emitirse');
    assert.equal(r.emoji, '👀');
    assert.equal(r.msgId, 'M1');
    assert.equal(r.senderJid, '5219999999999@s.whatsapp.net');
    assert.equal(t.active, true);

    const d2 = deps();
    await mountAckReaction(d2, { chatJid: '5219999999999@s.whatsapp.net', msgId: 'M2', senderJid: '', isGroup: false });
    assert.equal(d2.calls.find((c) => c.fn === 'reaction').senderJid, '', 'en 1:1 se omite sender');
  });

  it('withAckReaction: monta, corre fn, limpia con "" tras éxito', async () => {
    const d = deps();
    const order = [];
    const logging = { ...d, sendReactionFn: async (...a) => { order.push(a[2]); return d.sendReactionFn(...a); } };
    const out = await withAckReaction(logging,
      { chatJid: 'c', msgId: 'M', senderJid: '', isGroup: false },
      async () => { order.push('fn'); return 'ok'; });
    assert.equal(out, 'ok');
    assert.deepEqual(order, ['👀', 'fn', ''], 'montar → fn → limpiar');
  });

  it('limpia con "" aunque la inferencia falle, y el error se propaga', async () => {
    const d = deps();
    await assert.rejects(() => withAckReaction(d,
      { chatJid: 'c', msgId: 'M', senderJid: '', isGroup: false },
      async () => { throw new Error('agy caído'); }), /agy caído/);
    const last = d.calls[d.calls.length - 1];
    assert.equal(last.fn, 'reaction');
    assert.equal(last.emoji, '', 'cleanup con emoji vacío');
  });

  it('fail-open: si send_reaction falla al montar, el turno igual corre y responde', async () => {
    const logs = [];
    const d = deps(logs);
    d.sendReactionFn = async () => { throw new Error('daemon caído'); };
    let ran = false;
    const out = await withAckReaction(d,
      { chatJid: 'c', msgId: 'M', senderJid: '', isGroup: false },
      async () => { ran = true; return 'reply'; });
    assert.equal(ran, true);
    assert.equal(out, 'reply');
    assert.ok(logs.join(' ').includes('omitido'), 'log discreto del fallo');
  });

  it('fail-open: si la limpieza falla, no lanza', async () => {
    const d = deps();
    let n = 0;
    d.sendReactionFn = async (...a) => { n += 1; if (n > 1) throw new Error('caído al limpiar'); return {}; };
    const out = await withAckReaction(d,
      { chatJid: 'c', msgId: 'M', senderJid: '', isGroup: false },
      async () => 'ok');
    assert.equal(out, 'ok');
  });

  it('anti-echo: IDs propios registrados se descartan (sin bucles por 👀 propias)', async () => {
    const antiEcho = require('../../modules/anti-echo-tracker.js');
    antiEcho.recordSentMessage('SELF-1', 'c@s.whatsapp.net', 'texto');
    assert.equal(antiEcho.hasSentId('SELF-1'), true);
  });

  it('la limpieza en grupo conserva el sender del trigger', async () => {
    const d = deps();
    await withAckReaction(d,
      { chatJid: '12036301@g.us', msgId: 'M', senderJid: '5219999999999@s.whatsapp.net', isGroup: true },
      async () => 'ok');
    const clean = d.calls.find((c) => c.fn === 'reaction' && c.emoji === '');
    assert.equal(clean.senderJid, '5219999999999@s.whatsapp.net');
    assert.equal(clean.msgId, 'M');
  });
});
