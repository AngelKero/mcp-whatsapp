const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { DatabaseSync } = require('node:sqlite');

const permissions = require('../../modules/permissions/chat-permissions.js');
const createChatPermissionsMiddleware = require('../../pipeline/middlewares/chat-permissions.middleware.js');
const { isPanelCommand } = require('../../pipeline/middlewares/chat-permissions.middleware.js');

describe('Chat Permissions & Panel Admin', () => {
  let tmpDir;
  let permDbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-perms-'));
    permDbPath = path.join(tmpDir, 'chat-permissions.db');
    permissions._setDbPath(permDbPath);
  });

  afterEach(() => {
    permissions._closeDb();
    permissions._setDbPath(null);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    try {
      const dash = require('../../modules/dashboard/server.js');
      dash._resetForTests();
    } catch {}
  });

  describe('defaults inteligentes', () => {
    it('marketplace -> SILENT', () => {
      const p = permissions.getChatPermission('120363038501758837@g.us', 'CUCEA EATS 2.0');
      assert.equal(p.autonomy_mode, 'SILENT');
    });

    it('marketplace por nombre -> SILENT', () => {
      const p = permissions.getChatPermission('999999@g.us', 'Bazar de ventas varias');
      assert.equal(p.autonomy_mode, 'SILENT');
    });

    it('chat propio de Ángel -> AUTONOMOUS', () => {
      const p = permissions.getChatPermission('5213325094748@s.whatsapp.net', '@kero0ne');
      assert.equal(p.autonomy_mode, 'AUTONOMOUS');
    });

    it('chat normal -> MENTIONS_ONLY', () => {
      const p = permissions.getChatPermission('5213313148482@s.whatsapp.net', 'Pipo');
      assert.equal(p.autonomy_mode, 'MENTIONS_ONLY');
      assert.equal(p.allow_notion, 1);
      assert.equal(p.allow_media, 1);
    });
  });

  describe('setChatPermission', () => {
    it('roundtrip guarda y lee', () => {
      permissions.setChatPermission('5213313148482@s.whatsapp.net', {
        autonomy_mode: 'AUTONOMOUS',
        allow_notion: 0,
        allow_media: 0,
        chat_name: 'Pipo'
      });
      const p = permissions.getChatPermission('5213313148482@s.whatsapp.net');
      assert.equal(p.autonomy_mode, 'AUTONOMOUS');
      assert.equal(p.allow_notion, 0);
      assert.equal(p.allow_media, 0);
      assert.equal(p.is_custom, true);
    });

    it('rechaza modo inválido', () => {
      assert.throws(
        () => permissions.setChatPermission('a@s.whatsapp.net', { autonomy_mode: 'YOLO' }),
        /autonomy_mode inválido/
      );
    });

    it('actualización parcial conserva el resto', () => {
      permissions.setChatPermission('x@s.whatsapp.net', { autonomy_mode: 'SILENT' });
      permissions.setChatPermission('x@s.whatsapp.net', { allow_media: 0 });
      const p = permissions.getChatPermission('x@s.whatsapp.net');
      assert.equal(p.autonomy_mode, 'SILENT');
      assert.equal(p.allow_media, 0);
      assert.equal(p.allow_notion, 1);
    });
  });

  describe('killswitch global', () => {
    it('default encendido, toggle apaga y prende', () => {
      assert.equal(permissions.isGlobalEnabled(), true);
      permissions.setGlobalEnabled(false);
      assert.equal(permissions.isGlobalEnabled(), false);
      permissions.setGlobalEnabled(true);
      assert.equal(permissions.isGlobalEnabled(), true);
    });
  });

  describe('isPanelCommand', () => {
    it('detecta variantes del comando', () => {
      const yes = ['!panel', '/panel', '!admin', '/admin', 'panel', 'quiero administrar',
        'panel de control', 'pasame el link', 'pasa el link', 'link del panel',
        '!PANEL', '  !admin  '];
      for (const t of yes) {
        assert.equal(isPanelCommand(t), true, `debió detectar: ${t}`);
      }
    });

    it('no dispara con texto normal', () => {
      const no = ['hola', 'panela de control', '!ia hola', '!buscar algo', 'quiero pan'];
      for (const t of no) {
        assert.equal(isPanelCommand(t), false, `no debió detectar: ${t}`);
      }
    });
  });

  describe('chat-permissions middleware', () => {
    it('inyecta ctx.permissions y continúa en MENTIONS_ONLY', async () => {
      const mw = createChatPermissionsMiddleware({ permissions });
      let continued = false;
      const ctx = {
        text: 'hola qué onda',
        chatJid: '5213313148482@s.whatsapp.net',
        contactName: 'Pipo',
        isFromAngel: false,
        isMyOwnChat: false,
        msg: { id: 'm1' }
      };
      await mw(ctx, () => { continued = true; });
      assert.equal(continued, true);
      assert.equal(ctx.permissions.autonomy_mode, 'MENTIONS_ONLY');
    });

    it('SILENT descarta el turno por completo', async () => {
      permissions.setChatPermission('silent@g.us', { autonomy_mode: 'SILENT' });
      const mw = createChatPermissionsMiddleware({ permissions });
      let continued = false;
      await mw({ text: 'hola', chatJid: 'silent@g.us', contactName: 'G', msg: {} }, () => { continued = true; });
      assert.equal(continued, false);
    });

    it('SILENT pero !panel de Ángel sí responde el link', async () => {
      permissions.setChatPermission('silent2@g.us', { autonomy_mode: 'SILENT' });
      const sent = [];
      const mw = createChatPermissionsMiddleware({
        permissions,
        antiEcho: { remember: () => {} },
        sendMessage: async (jid, txt) => { sent.push({ jid, txt }); return {}; },
        sendReply: async () => { throw new Error('no debería usar reply en chat propio'); }
      });
      let continued = false;
      await mw({
        text: '!panel',
        chatJid: 'silent2@g.us',
        contactName: 'G',
        sender: 'x',
        isGroup: true,
        isFromAngel: true,
        isMyOwnChat: true,
        msg: { id: 'm-panel' }
      }, () => { continued = true; });
      assert.equal(continued, false);
      assert.equal(sent.length, 1);
      assert.match(sent[0].txt, /Panel de Control/);
      assert.match(sent[0].txt, /8767/);
    });

    it('killswitch apagado aborta en silencio (salvo panel)', async () => {
      permissions.setGlobalEnabled(false);
      const mw = createChatPermissionsMiddleware({ permissions });
      let continued = false;
      await mw({ text: 'hola', chatJid: 'a@s.whatsapp.net', msg: {} }, () => { continued = true; });
      assert.equal(continued, false);
    });

    it('killswitch apagado pero !panel de Ángel sí pasa', async () => {
      permissions.setGlobalEnabled(false);
      const sent = [];
      const mw = createChatPermissionsMiddleware({
        permissions,
        antiEcho: { remember: () => {} },
        sendMessage: async (jid, txt) => { sent.push(txt); return {}; }
      });
      let continued = false;
      await mw({
        text: '!admin',
        chatJid: '5213325094748@s.whatsapp.net',
        sender: 's',
        isGroup: false,
        isFromAngel: true,
        isMyOwnChat: true,
        msg: { id: 'm2' }
      }, () => { continued = true; });
      assert.equal(sent.length, 1);
      assert.match(sent[0], /localhost:8767/);
    });

    it('no responde panel a terceros (solo Ángel)', async () => {
      const sent = [];
      const mw = createChatPermissionsMiddleware({
        permissions,
        antiEcho: { remember: () => {} },
        sendMessage: async () => { sent.push(1); return {}; },
        sendReply: async () => { sent.push(1); return {}; }
      });
      // Tercero pide panel en grupo: no debe responder (fromAngel=false)
      // pero tampoco debe romper: killswitch ON + MENTIONS_ONLY -> continúa
      let continued = false;
      await mw({
        text: '!panel',
        chatJid: '5219999999999@s.whatsapp.net',
        contactName: 'Extraño',
        sender: '5219999999999',
        isGroup: false,
        isFromAngel: false,
        isMyOwnChat: false,
        msg: { id: 'm3' }
      }, () => { continued = true; });
      assert.equal(sent.length, 0);
      assert.equal(continued, true);
    });
  });

  describe('getAllChatsWithPermissions', () => {
    it('mezcla chats + permisos ordenados por actividad', () => {
      const mdir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-msgs-'));
      const mpath = path.join(mdir, 'messages.db');
      const mdb = new DatabaseSync(mpath);
      mdb.exec(`
        CREATE TABLE chats (jid TEXT PRIMARY KEY, name TEXT, last_message_time TIMESTAMP);
        INSERT INTO chats VALUES
          ('a@s.whatsapp.net', 'Ana', '2026-09-28 10:00:00'),
          ('b@g.us', 'Grupo B', '2026-09-28 12:00:00'),
          ('status@broadcast', 'Status', '2026-09-28 13:00:00');
      `);
      mdb.close();

      permissions.setChatPermission('a@s.whatsapp.net', { autonomy_mode: 'SILENT', chat_name: 'Ana' });
      const list = permissions.getAllChatsWithPermissions({ messagesDbPath: mpath });
      assert.equal(list.length, 2, 'debe excluir status@broadcast');
      assert.equal(list[0].jid, 'b@g.us', 'ordenado por actividad reciente');
      const ana = list.find((c) => c.jid === 'a@s.whatsapp.net');
      assert.equal(ana.autonomy_mode, 'SILENT');
      assert.equal(ana.is_custom, true);
      const grupo = list.find((c) => c.jid === 'b@g.us');
      assert.equal(grupo.is_group, true);
      assert.equal(grupo.autonomy_mode, 'MENTIONS_ONLY');

      fs.rmSync(mdir, { recursive: true, force: true });
    });
  });

  describe('guards aguas abajo (allow_media / allow_notion)', () => {
    it('media-extractor salta con allow_media=0', async () => {
      const createMedia = require('../../pipeline/middlewares/media-extractor.middleware.js');
      const mw = createMedia(null);
      let continued = false;
      await mw({
        msg: { id: 'x' },
        chatJid: 'a@s.whatsapp.net',
        sender: 's',
        isAudio: true,
        isDocument: false,
        isImage: false,
        isSticker: false,
        isGroup: false,
        isFromAngel: true,
        isFromErika: false,
        isMyOwnChat: true,
        senderName: 'Angel',
        contactName: 'Yo',
        text: '',
        permissions: { allow_media: 0, autonomy_mode: 'AUTONOMOUS' }
      }, () => { continued = true; });
      assert.equal(continued, true);
    });

    it('passive-extractor salta con allow_notion=0', async () => {
      const createPassive = require('../../pipeline/middlewares/passive-extractor.middleware.js');
      const mw = createPassive();
      let continued = false;
      await mw({
        text: 'recuérdame comprar leche mañana',
        chatJid: 'a@s.whatsapp.net',
        isFromAngel: true,
        isFromErika: false,
        contactName: 'Yo',
        permissions: { allow_notion: 0, autonomy_mode: 'AUTONOMOUS' }
      }, () => { continued = true; });
      assert.equal(continued, true);
    });
  });

  describe('dashboard server', () => {
    it('sirve SPA + status + CRUD de permisos', async () => {
      const dash = require('../../modules/dashboard/server.js');
      const srv = dash.startDashboardServer({ port: 0 });
      await new Promise((r) => srv.on('listening', r));
      const port = srv.address().port;
      assert.ok(port > 0);

      const get = (p) => new Promise((resolve, reject) => {
        http.get({ hostname: '127.0.0.1', port, path: p }, (res) => {
          let d = '';
          res.on('data', (c) => (d += c));
          res.on('end', () => resolve({ code: res.statusCode, body: d, headers: res.headers }));
        }).on('error', reject);
      });
      const put = (p, obj) => new Promise((resolve, reject) => {
        const data = JSON.stringify(obj);
        const req = http.request({ hostname: '127.0.0.1', port, path: p, method: 'PUT', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
          let d = '';
          res.on('data', (c) => (d += c));
          res.on('end', () => resolve({ code: res.statusCode, body: d }));
        });
        req.on('error', reject);
        req.write(data);
        req.end();
      });

      const spa = await get('/');
      assert.equal(spa.code, 200);
      assert.match(spa.body, /Panel Antigravity/);

      const st = await get('/api/status');
      assert.equal(st.code, 200);
      const status = JSON.parse(st.body);
      assert.ok('global_enabled' in status);
      assert.ok('total_chats' in status);

      const upd = await put('/api/chats/' + encodeURIComponent('dash-test@s.whatsapp.net'), { autonomy_mode: 'SILENT', allow_media: 0 });
      assert.equal(upd.code, 200);
      const saved = JSON.parse(upd.body);
      assert.equal(saved.autonomy_mode, 'SILENT');

      const bad = await put('/api/chats/' + encodeURIComponent('dash-test@s.whatsapp.net'), { autonomy_mode: 'NOPE' });
      assert.equal(bad.code, 400);

      await new Promise((r) => srv.close(r));
      dash._resetForTests();
    });
  });
});
