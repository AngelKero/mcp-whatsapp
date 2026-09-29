const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

// Middlewares y módulos bajo prueba
const createMacControlMiddleware = require('../../pipeline/middlewares/mac-control.middleware.js');
const passiveExtractor = require('../../passive-extractor.js');
const notionActions = require('../../notion-actions.js');
const chatHistorySearch = require('../../modules/search/chat-history-search.js');
const createChatSearchMiddleware = require('../../pipeline/middlewares/chat-search.middleware.js');
const createSchoolNoticeMiddleware = require('../../pipeline/middlewares/school-notice.middleware.js');
const proactivePulseEngine = require('../../modules/proactive/proactive-pulse.js');

test('OpenSpec Scenario Verification Suite', async (t) => {

  // =========================================================================
  // SPEC: mac-control
  // =========================================================================
  await t.test('spec: mac-control scenarios', async (st) => {
    const mockAntiEcho = { remember: () => {} };

    await st.test('Scenario: Host metrics retrieved successfully', async () => {
      let sentReply = '';
      const replyFn = async (chatJid, msg) => { sentReply = msg; };
      const mw = createMacControlMiddleware(mockAntiEcho, replyFn, replyFn);

      const ctx = {
        text: '!mac status',
        chatJid: '5213325094748@s.whatsapp.net',
        sender: '5213325094748@s.whatsapp.net',
        isGroup: false,
        isFromAngel: true,
        isMyOwnChat: true,
        msg: { id: 'msg-status-1' }
      };

      await mw(ctx, () => {});
      assert.match(sentReply, /ESTATUS DE TU MAC/);
      assert.match(sentReply, /Batería:/);
      assert.match(sentReply, /CPU & RAM:/);
      assert.match(sentReply, /Disco principal:/);
    });

    await st.test('Scenario: Acoustic discovery ping triggered by owner', async () => {
      let sentReply = '';
      const replyFn = async (chatJid, msg) => { sentReply = msg; };
      const mw = createMacControlMiddleware(mockAntiEcho, replyFn, replyFn);

      const ctx = {
        text: '!mac ping',
        chatJid: '5213325094748@s.whatsapp.net',
        isFromAngel: true,
        isMyOwnChat: true,
        msg: { id: 'msg-ping-1' }
      };

      await mw(ctx, () => {});
      assert.match(sentReply, /Ping Acústico Disparado/);
    });

    await st.test('Scenario: Session screen locking triggered by owner', async () => {
      let sentReply = '';
      const replyFn = async (chatJid, msg) => { sentReply = msg; };
      const mw = createMacControlMiddleware(mockAntiEcho, replyFn, replyFn);

      const ctx = {
        text: '!mac lock',
        chatJid: '5213325094748@s.whatsapp.net',
        isFromAngel: true,
        isMyOwnChat: true,
        msg: { id: 'msg-lock-1' }
      };

      await mw(ctx, () => {});
      assert.match(sentReply, /Mac Bloqueada/);
    });

    await st.test('Scenario: Command help menu requested', async () => {
      let sentReply = '';
      const replyFn = async (chatJid, msg) => { sentReply = msg; };
      const mw = createMacControlMiddleware(mockAntiEcho, replyFn, replyFn);

      const ctx = {
        text: '!mac help',
        chatJid: '5213325094748@s.whatsapp.net',
        isFromAngel: true,
        isMyOwnChat: true,
        msg: { id: 'msg-help-1' }
      };

      await mw(ctx, () => {});
      assert.match(sentReply, /COMANDOS SYSADMIN MACOS/);
      assert.match(sentReply, /!mac status/);
      assert.match(sentReply, /!mac ping/);
    });

    await st.test('Scenario: Unauthorized participant command attempt rejected', async () => {
      let sentReply = '';
      const replyFn = async (chatJid, msg) => { sentReply = msg; };
      const mw = createMacControlMiddleware(mockAntiEcho, replyFn, replyFn);

      const ctx = {
        text: '!mac status',
        chatJid: '120363411190829094@g.us',
        sender: '5213399999999@s.whatsapp.net',
        isGroup: true,
        isFromAngel: false,
        isMyOwnChat: false,
        msg: { id: 'msg-unauth-1' }
      };

      await mw(ctx, () => {});
      assert.match(sentReply, /Acceso Denegado/);
    });
  });

  // =========================================================================
  // SPEC: passive-extractor
  // =========================================================================
  await t.test('spec: passive-extractor scenarios', async (st) => {
    const origCreateTransaction = notionActions.createTransaction;
    const origCreateTask = notionActions.createTask;
    const origCreateNote = notionActions.createNote;
    const origGetActiveProjects = notionActions.getActiveProjects;

    notionActions.createTransaction = async (data) => ({ id: 'mock-tx-123', ...data });
    notionActions.createTask = async (title, opts) => ({ id: 'mock-task-123', title, ...opts });
    notionActions.createNote = async (title, content, opts) => ({ id: 'mock-note-123', title, content, ...opts });
    notionActions.getActiveProjects = async () => [{ id: 'proj-1', name: 'Date Planning' }];

    st.after(() => {
      notionActions.createTransaction = origCreateTransaction;
      notionActions.createTask = origCreateTask;
      notionActions.createNote = origCreateNote;
      notionActions.getActiveProjects = origGetActiveProjects;
    });

    await st.test('Scenario: Explicit amount expense extracted', async () => {
      const result = await passiveExtractor.processMessage('gasté $150 en tacos', true, { isMyOwnChat: true });
      assert.ok(result);
      assert.equal(result.action, 'transaction');
      assert.equal(result.amount, 150);
      assert.match(result.message, /150/);
      assert.match(result.concept, /tacos/i);
    });

    await st.test('Scenario: Non-numeric payment recorded', async () => {
      const result = await passiveExtractor.processMessage('ya pagué netflix', true, { isMyOwnChat: true });
      assert.ok(result);
      assert.equal(result.action, 'transaction');
      assert.match(result.concept, /netflix/i);
    });

    await st.test('Scenario: Routine or rest statement rejected by actionability gate', async () => {
      const resSleep = await passiveExtractor.processMessage('me voy a dormir, buenas noches', true, { isMyOwnChat: true });
      assert.equal(resSleep, null);

      const resLocation = await passiveExtractor.processMessage('aquí ando en el centro', true, { isMyOwnChat: true });
      assert.equal(resLocation, null);
    });

    await st.test('Scenario: Natural language datetime reminder extracted', async () => {
      const result = await passiveExtractor.processMessage('recordatorio: pagar el agua mañana a las 11am', true, { isMyOwnChat: true });
      assert.ok(result);
      assert.equal(result.action, 'reminder');
      assert.match(result.title, /pagar el agua/i);
      assert.match(result.message, /Anotado para/);
      assert.match(result.message, /11:00 hrs/);
    });

    await st.test('Scenario: Rapid note created with prefix', async () => {
      const result = await passiveExtractor.processMessage('nota: La IP del servidor es 192.168.1.50', true, { isMyOwnChat: true });
      assert.ok(result);
      assert.equal(result.action, 'note');
      assert.match(result.title, /La IP del servidor es 192.168.1.50/);
    });

    await st.test('Scenario: Erroneous task deleted via cancellation phrase', async () => {
      const originalArchive = notionActions.archiveTask;
      notionActions.archiveTask = async () => true;

      try {
        passiveExtractor.lastCreatedTaskId = '249853a1-d77e-80b3-9e5c-eca51f834edf';
        passiveExtractor.lastCreatedTaskTitle = 'Tarea accidental para borrar';
        passiveExtractor.lastCreatedTaskTimestamp = Date.now();

        const result = await passiveExtractor.processMessage('eso no es una tarea', true, { isMyOwnChat: true });
        assert.ok(result);
        assert.equal(result.action, 'task_canceled');
        assert.match(result.message, /cancelé y eliminé de Notion/i);
      } finally {
        notionActions.archiveTask = originalArchive;
      }
    });
  });

  // =========================================================================
  // SPEC: chat-search
  // =========================================================================
  await t.test('spec: chat-search scenarios', async (st) => {

    await st.test('Scenario: Query token sanitization strips boolean operators', () => {
      const sanitized = chatHistorySearch.sanitizeQuery('examen AND redes OR final NOT tarea NEAR parcial');
      assert.doesNotMatch(sanitized, /\b(AND|OR|NOT|NEAR)\b/);
      assert.match(sanitized, /"examen"\*/);
      assert.match(sanitized, /"redes"\*/);
    });

    await st.test('Scenario: Special characters cleaned without crashing FTS5', () => {
      const sanitized = chatHistorySearch.sanitizeQuery('!@#$%^&*() comprobante oxxo???');
      assert.match(sanitized, /"comprobante"\*/);
      assert.match(sanitized, /"oxxo"\*/);
    });

    await st.test('Scenario: Search attempted by third party in group is suppressed', async () => {
      let wasCalled = false;
      const replyFn = async () => { wasCalled = true; };
      const mw = createChatSearchMiddleware({ remember: () => {} }, replyFn);

      let nextCalled = false;
      const ctx = {
        text: '!buscar apuntes',
        chatJid: '120363411190829094@g.us',
        isGroup: true,
        isFromAngel: false, // Tercero
        msg: { id: 'msg-third-party-search' }
      };

      await mw(ctx, async () => { nextCalled = true; });
      assert.equal(wasCalled, false);
      assert.equal(nextCalled, true);
    });
  });

  // =========================================================================
  // SPEC: school-notices
  // =========================================================================
  await t.test('spec: school-notices scenarios', async (st) => {
    await st.test('Scenario: Message in unmonitored group passes through', async () => {
      let classifyCalled = false;
      const classifyFn = async () => { classifyCalled = true; return null; };
      const mw = createSchoolNoticeMiddleware(classifyFn, { prepare: () => ({ get: () => null }) });

      let nextCalled = false;
      const ctx = {
        text: 'aviso general',
        chatJid: 'unregistered-group@g.us',
        msg: { is_from_me: 0 }
      };

      await mw(ctx, async () => { nextCalled = true; });
      assert.equal(classifyCalled, false);
      assert.equal(nextCalled, true);
    });
  });

  // =========================================================================
  // SPEC: proactive-pulse
  // =========================================================================
  await t.test('spec: proactive-pulse scenarios', async (st) => {
    await st.test('Scenario: SQLite pulse idempotency prevents duplicate alerts', () => {
      const pulseKey = `test:idempotency:${Date.now()}`;
      assert.equal(proactivePulseEngine.isPulseDispatched(pulseKey), false);

      proactivePulseEngine.markPulseDispatched(pulseKey, 'unit_test', 'payload_1');
      assert.equal(proactivePulseEngine.isPulseDispatched(pulseKey), true);
    });
  });
});
