const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

// OJO orden de requires: primero mcp-client para stubear sendMessage ANTES de
// que daily-briefing y passive-extractor lo destructuren en su carga.
const mcpClient = require('../../mcp-client.js');
let sent = [];
mcpClient.sendMessage = async (jid, text) => {
  sent.push({ jid, text });
  return mcpClient.__nextSendResult || { ID: 'test-id-1' };
};

const dailyBriefing = require('../../daily-briefing.js');
const passiveExtractor = require('../../passive-extractor.js');
const { classifyUserIntent } = require('../../system-one-client.js');

describe('owner-dispatch: acciones sensibles solo en chat propio', () => {
  before(() => { sent = []; });

  it('saludo sin petición no clasifica a briefing (determinista, sin red)', async () => {
    assert.equal(await classifyUserIntent('buenos días amorcito, como amaneciste?'), 'otra');
    assert.equal(await classifyUserIntent('buenos días'), 'otra');
  });

  it('petición explícita sí clasifica a briefing', async () => {
    assert.equal(await classifyUserIntent('dame mi agenda de hoy'), 'daily_briefing');
    assert.equal(await classifyUserIntent('buenos días, pasame mi agenda'), 'daily_briefing');
  });

  it('tercero no dispara briefing aunque pida agenda', async () => {
    const res = await passiveExtractor.processMessage('dame mi agenda de hoy', false, { isMyOwnChat: false });
    assert.equal(res, null);
  });

  it('tercero saludando no dispara nada', async () => {
    const res = await passiveExtractor.processMessage('buenos días amorcito, como amaneciste?', false, { isMyOwnChat: false });
    assert.equal(res, null);
  });

  it('dueño en chat propio sí recibe briefing', async () => {
    const orig = dailyBriefing.generateBriefingMessage;
    dailyBriefing.generateBriefingMessage = async () => 'BRIEF-TEST';
    try {
      const res = await passiveExtractor.processMessage('dame mi agenda de hoy', true, { isMyOwnChat: true });
      assert.equal(res && res.action, 'daily_briefing');
      assert.equal(res.message, 'BRIEF-TEST');
    } finally {
      dailyBriefing.generateBriefingMessage = orig;
    }
  });

  it('MY_PHONE_JID/NUMBER nunca vacíos (fallback endurecido)', () => {
    const env = require('../../config/env.js');
    assert.ok(env.MY_PHONE_JID.endsWith('@s.whatsapp.net'), `JID: ${env.MY_PHONE_JID}`);
    assert.ok(/^\d+$/.test(env.MY_PHONE_NUMBER), `number: ${env.MY_PHONE_NUMBER}`);
  });

  it('sendMorningBriefing exige destinatario e ID de entrega', async () => {
    await assert.rejects(() => dailyBriefing.sendMorningBriefing(''), /destinatario/);
    mcpClient.__nextSendResult = {};
    await assert.rejects(() => dailyBriefing.sendMorningBriefing('x@s.whatsapp.net'), /ID de entrega/);
    mcpClient.__nextSendResult = { ID: 'ok-1' };
    // generateBriefingMessage real haría red; stubear para este caso:
    const orig = dailyBriefing.generateBriefingMessage;
    dailyBriefing.generateBriefingMessage = async () => 'BRIEF-TEST';
    try {
      const r = await dailyBriefing.sendMorningBriefing('x@s.whatsapp.net');
      assert.equal(r.success, true);
    } finally {
      dailyBriefing.generateBriefingMessage = orig;
      delete mcpClient.__nextSendResult;
    }
  });
});
