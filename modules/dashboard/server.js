/**
 * modules/dashboard/server.js
 * Panel Web Local de Administración y Autonomía de Chats (puerto 8767).
 * HTTP nativo (sin Express) + SPA en Dark Mode servida en GET /.
 */
const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const { DB_PATHS, SYSTEM_ONE_URL } = require('../../config/env.js');
const permissions = require('../permissions/chat-permissions.js');

const DEFAULT_PORT = parseInt(process.env.DASHBOARD_PORT || '8767', 10) || 8767;
const startTime = Date.now();
let serverInstance = null;

function checkLaya(timeoutMs = 1500) {
  return new Promise((resolve) => {
    try {
      const target = new URL(SYSTEM_ONE_URL);
      const req = http.request(
        {
          hostname: target.hostname,
          port: target.port || 8766,
          path: '/',
          method: 'GET',
          timeout: timeoutMs
        },
        (res) => {
          res.resume();
          resolve('online');
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve('offline');
      });
      req.on('error', () => resolve('offline'));
      req.end();
    } catch {
      resolve('offline');
    }
  });
}

function countTotalChats() {
  try {
    const mdb = new DatabaseSync(DB_PATHS.MESSAGES, { readOnly: true });
    try {
      const row = mdb.prepare('SELECT COUNT(*) AS n FROM chats').get();
      return row?.n || 0;
    } finally {
      try { mdb.close(); } catch {}
    }
  } catch {
    return 0;
  }
}

function countActiveSessions() {
  try {
    const path = require('path');
    const sessionsPath = path.join(__dirname, '..', '..', 'store', 'sessions.db');
    const sdb = new DatabaseSync(sessionsPath, { readOnly: true });
    try {
      const row = sdb.prepare(
        "SELECT COUNT(*) AS n FROM ai_sessions WHERE is_active = 1 AND state IN ('ACTIVE','LURK_MODE')"
      ).get();
      return row?.n || 0;
    } finally {
      try { sdb.close(); } catch {}
    }
  } catch {
    return 0;
  }
}

async function buildStatus() {
  const [laya] = await Promise.all([checkLaya()]);
  return {
    global_enabled: permissions.isGlobalEnabled(),
    watcher_uptime_sec: Math.floor((Date.now() - startTime) / 1000),
    watcher_uptime_human: humanUptime(Date.now() - startTime),
    laya_status: laya,
    total_chats: countTotalChats(),
    active_sessions: countActiveSessions(),
    port: DEFAULT_PORT
  };
}

function humanUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

function readBody(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('Body demasiado grande'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

const SPA_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='11' fill='%23C2410C'/%3E%3Cpath d='M12 7v5' stroke='white' stroke-width='2.6' stroke-linecap='round'/%3E%3C/svg%3E">
<title>Antigravity · Panel de Chats</title>
<style>
:root{color-scheme:light;--bg:#FFF6E9;--card:#FFFFFF;--card2:#FFF1DE;--ink:#2E1F14;--mut:#7A5A38;--tang:#C2410C;--tang-soft:#FDE3CF;--grape:#6D28D9;--grape-soft:#E9DEFC;--lime:#15803D;--lime-soft:#D9F2E3;--amber:#B45309;--amber-soft:#FBEACB;--red:#B91C1C;--red-soft:#F9DADA;--line:#EEDDC3;--shadow:0 8px 20px rgba(194,65,12,.14)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}body{margin:0;background:var(--bg);color:var(--ink);font-family:ui-rounded,"SF Pro Rounded",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
::selection{background:var(--tang);color:#fff}input,textarea{caret-color:var(--tang)}
::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:var(--tang);border-radius:99px;border:2px solid var(--bg)}::-webkit-scrollbar-track{background:transparent}
a{color:var(--grape)}
header{position:sticky;top:0;z-index:10;background:rgba(255,246,233,.94);backdrop-filter:blur(12px);border-bottom:3px solid var(--ink);padding:14px 16px}
.top{display:flex;align-items:center;gap:14px;max-width:980px;margin:0 auto}
h1{font-size:22px;margin:0;flex:1;letter-spacing:-.01em}h1 small{display:block;font-size:13px;color:var(--mut);font-weight:600}
.kill{display:flex;align-items:center;gap:10px;background:var(--card);border:3px solid var(--ink);border-radius:999px;padding:8px 16px 8px 8px;color:var(--ink);font-size:15px;font-weight:800;min-height:56px;box-shadow:var(--shadow);cursor:pointer}
.kill .pwr{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--lime);transition:background .18s ease-out,transform .22s cubic-bezier(.25,1,.5,1)}
.kill.off .pwr{background:var(--red)}.kill:active .pwr{transform:scale(.88)}
.kill svg{width:22px;height:22px;stroke:#fff;fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.kill b{font-size:14px;letter-spacing:.04em}
.kill:not(.off) .pwr{animation:pulse 2.4s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 0 0 rgba(21,128,61,.45)}50%{box-shadow:0 0 0 8px rgba(21,128,61,0)}}
@media (prefers-reduced-motion:reduce){.kill:not(.off) .pwr{animation:none}.seg button.pop{animation:none}}
.seg button.pop{animation:pop .28s cubic-bezier(.25,1,.5,1)}
@keyframes pop{40%{transform:scale(1.12)}}
.card.is-silent{background:var(--card2)}
.card.is-silent .nm{opacity:.75}
.empty{ text-align:center;padding:28px 18px}
.empty b{font-size:18px;display:block;margin-bottom:6px}
.empty p{color:var(--mut);font-size:14px;font-weight:600;margin:0 0 14px}
.empty button{border:3px solid var(--ink);background:var(--tang);color:#fff;border-radius:999px;padding:12px 22px;font-size:14px;font-weight:800;min-height:48px;cursor:pointer;font-family:inherit}
main{max-width:980px;margin:0 auto;padding:18px 16px 16px}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px}
.stat{background:var(--card);border:3px solid var(--ink);border-radius:18px;padding:12px 14px;box-shadow:var(--shadow)}
.stat span{font-size:12px;color:var(--mut);display:block;font-weight:700}.stat b{font-size:20px;font-variant-numeric:tabular-nums}
.stat:nth-child(1){background:var(--tang-soft)}.stat:nth-child(2){background:var(--grape-soft)}.stat:nth-child(3){background:var(--lime-soft)}.stat:nth-child(4){background:var(--amber-soft)}
.searchwrap{display:flex;align-items:center;gap:10px;background:var(--card);border:3px solid var(--ink);border-radius:16px;padding:0 14px;margin-bottom:12px;box-shadow:var(--shadow)}
.searchwrap svg{width:20px;height:20px;stroke:var(--tang);fill:none;stroke-width:2.6;stroke-linecap:round;flex:none}
.searchwrap label{font-size:13px;font-weight:800;color:var(--mut);white-space:nowrap}
.search{flex:1;border:0;background:transparent;color:var(--ink);font-size:16px;padding:14px 0;min-height:48px;outline:none;font-family:inherit}
.search::placeholder{color:var(--mut);opacity:1}
.tabs{display:flex;gap:10px;overflow-x:auto;padding:4px 2px 12px;margin-bottom:4px}
.tab{white-space:nowrap;border:3px solid var(--ink);background:var(--card);color:var(--ink);border-radius:999px;padding:10px 18px;font-size:14px;font-weight:800;min-height:44px;cursor:pointer;font-family:inherit}
.tab.act{background:var(--ink);color:#FFF6E9}
.list{display:flex;flex-direction:column;gap:14px;padding-bottom:40px}
.card{background:var(--card);border:3px solid var(--ink);border-radius:22px;padding:16px;box-shadow:var(--shadow)}
.row1{display:flex;align-items:center;gap:8px;margin-bottom:2px}.nm{font-weight:800;font-size:17px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.badge{font-size:12px;font-weight:800;padding:5px 12px;border-radius:999px;border:2px solid var(--ink);color:var(--ink);white-space:nowrap}
.badge.g{background:var(--grape-soft)}.badge.p{background:var(--tang-soft)}
.badge.silent{background:var(--red);color:#fff}.badge.ment{background:var(--amber);color:#fff}.badge.auto{background:var(--lime);color:#fff}
.badge.mk{background:#fff;color:var(--mut);border-style:dashed}
.jid{font-size:12px;color:var(--mut);margin:6px 0 12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}
.ctl{display:flex;flex-wrap:wrap;gap:10px;align-items:stretch}
.seg{display:flex;flex:1;min-width:220px;background:var(--card2);border:3px solid var(--ink);border-radius:14px;padding:4px;gap:4px}
.seg button{flex:1;border:0;border-radius:10px;background:transparent;color:var(--ink);font-size:13px;font-weight:800;padding:12px 4px;min-height:44px;cursor:pointer;font-family:inherit}
.seg button[aria-pressed="true"].m-silent{background:var(--red);color:#fff}
.seg button[aria-pressed="true"].m-ment{background:var(--amber);color:#fff}
.seg button[aria-pressed="true"].m-auto{background:var(--lime);color:#fff}
.mini{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:var(--ink);background:var(--card2);border:3px solid var(--ink);border-radius:14px;padding:10px 14px;min-height:48px;cursor:pointer}
.mini input{accent-color:var(--tang);width:22px;height:22px;margin:0}
.reset{display:inline-flex;align-items:center;gap:8px;background:transparent;color:var(--mut);border:3px dashed var(--line);border-radius:14px;padding:10px 16px;font-size:13px;font-weight:800;min-height:48px;cursor:pointer;font-family:inherit}
.reset svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.reset:active{color:var(--ink);border-color:var(--ink)}
.tab:hover,.seg button:hover,.reset:hover{filter:brightness(.96)}
.kill:hover{filter:brightness(1.03)}
.kill.armed{outline:3px solid var(--red);outline-offset:2px;animation:shake .3s ease}
@keyframes shake{25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}
#undo{display:none;align-items:center;gap:12px;background:var(--ink);color:#FFF6E9;border-radius:16px;padding:12px 16px;margin-bottom:12px;font-size:14px;font-weight:700}
#undo.show{display:flex}
#undo button{background:var(--lime);color:#fff;border:0;border-radius:999px;padding:10px 18px;font-size:14px;font-weight:800;min-height:44px;cursor:pointer;font-family:inherit}
#toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%) translateY(20px);background:var(--ink);color:#FFF6E9;border-radius:14px;padding:12px 18px;font-size:14px;font-weight:700;opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;z-index:50;max-width:min(92vw,480px);text-align:center}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
#statusErr{display:none;background:var(--red-soft);border:3px solid var(--red);border-radius:14px;padding:12px 14px;margin-bottom:12px;font-size:14px;font-weight:700}
#statusErr.show{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#statusErr button{background:var(--red);color:#fff;border:0;border-radius:10px;padding:10px 16px;font-size:14px;font-weight:800;min-height:44px;cursor:pointer;font-family:inherit}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
#count{font-size:13px;font-weight:800;color:var(--mut);margin:2px 2px 10px}
#bulkBar{display:none;position:sticky;top:76px;z-index:9;background:var(--ink);color:#FFF6E9;border-radius:16px;padding:10px 12px;margin-bottom:12px;align-items:center;gap:8px;flex-wrap:wrap;font-size:14px;font-weight:800}
#bulkBar.show{display:flex}
#bulkBar button{border:0;border-radius:999px;padding:10px 16px;font-size:13px;font-weight:800;min-height:44px;cursor:pointer;font-family:inherit;color:#fff}
#bulkBar .b-sil{background:var(--red)}#bulkBar .b-men{background:var(--amber)}#bulkBar .b-auto{background:var(--lime)}#bulkBar .b-cl{background:transparent;color:#FFF6E9;border:2px solid #FFF6E9}
#moreWrap{display:flex;justify-content:center;margin:6px 0 20px}
#more{border:3px solid var(--ink);background:var(--card);border-radius:999px;padding:12px 24px;font-size:14px;font-weight:800;min-height:48px;cursor:pointer;font-family:inherit;color:var(--ink);box-shadow:var(--shadow)}
.selBox{display:grid;place-items:center;width:44px;height:44px;flex:none}
.selBox input{width:24px;height:24px;accent-color:var(--grape)}
.tab .n{opacity:.65;font-variant-numeric:tabular-nums;margin-left:6px}
#clearQ{display:none;border:0;background:var(--card2);color:var(--ink);border-radius:999px;width:44px;height:44px;font-size:18px;font-weight:800;cursor:pointer;flex:none}
#clearQ.show{display:grid;place-items:center}
.jid{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--mut);margin:6px 0 12px;font-weight:600;min-width:0}
.jid span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.copyJid{flex:none;border:2px solid var(--line);background:transparent;border-radius:10px;font-size:12px;font-weight:800;padding:8px 12px;min-height:44px;cursor:pointer;color:var(--mut);font-family:inherit}
.copyJid:active{color:var(--ink);border-color:var(--ink)}
details.more{margin-top:10px;border-top:2px dashed var(--line);padding-top:6px}
details.more summary{list-style:none;cursor:pointer;font-size:13px;font-weight:800;color:var(--mut);min-height:44px;display:flex;align-items:center;gap:8px;border-radius:10px;padding:6px 4px}
details.more summary::-webkit-details-marker{display:none}
details.more summary:hover{color:var(--ink)}
.moreRow{display:flex;flex-wrap:wrap;gap:10px;padding:4px 0 2px}
.foot{text-align:center;color:var(--mut);font-size:13px;font-weight:600;padding:24px 16px;line-height:1.7}
:focus-visible{outline:3px solid var(--grape);outline-offset:2px;border-radius:8px}
@media(max-width:640px){.stats{grid-template-columns:repeat(2,1fr)}h1{font-size:19px}}
</style>
</head>
<body>
<header><div class="top"><h1>Panel Antigravity<small id="sub">cargando…</small></h1><button class="kill" id="kill" aria-label="Interruptor global del bot" aria-pressed="true"><span class="pwr"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8"/><path d="M6.3 6.5a8 8 0 1 0 11.4 0"/></svg></span><b id="ktx">Prendido</b></button></div></header>
<main>
<div id="live" class="vh" aria-live="polite" role="status"></div>
<div id="undo" role="alert"><span id="undoTx">Bot apagado</span><button id="undoBtn" type="button">Deshacer (10s)</button></div>
<div id="statusErr" role="alert"><span id="statusErrTx">Sin conexión con el panel.</span><button id="retryBtn" type="button">Reintentar</button></div>
<div class="stats"><div class="stat"><span>Chats</span><b id="sChats">–</b></div><div class="stat"><span>Sesiones activas</span><b id="sSes">–</b></div><div class="stat"><span>IA local</span><b id="sLaya">–</b></div><div class="stat"><span>Watcher activo</span><b id="sUp">–</b></div></div>
<div class="searchwrap"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.8-3.8"/></svg><label for="q">Buscar</label><input class="search" id="q" placeholder="Nombre o JID…" autocomplete="off"><button id="clearQ" type="button" aria-label="Limpiar búsqueda">✕</button></div>
<div class="tabs" id="tabs" role="tablist" aria-label="Filtros de chats"></div>
<div id="count" aria-live="polite">cargando…</div>
<div id="bulkBar" role="toolbar" aria-label="Acciones en lote"><span id="bulkTx">0 seleccionados</span><button class="b-sil" id="bulkSil" type="button">Silenciar</button><button class="b-men" id="bulkMen" type="button">Menciones</button><button class="b-auto" id="bulkAuto" type="button">Auto</button><button class="b-cl" id="bulkClear" type="button">Limpiar</button></div>
<div class="list" id="list"></div>
<div id="moreWrap"><button id="more" type="button" style="display:none">Mostrar más</button></div>
<div class="foot">Silencio = no responde nada · Menciones = solo responde a !ia, !buscar o @antigravity · Auto = escucha ambiental y responde solo :3</div>
</main>
<div id="toast" role="status" aria-live="polite"></div>
<script>
let chats=[],filter='all',query='',limit=120;const selected=new Set();
try{const sv=JSON.parse(localStorage.getItem('ag-panel')||'{}');if(sv.filter)filter=sv.filter;if(sv.query)query=sv.query;}catch{}
function saveView(){try{localStorage.setItem('ag-panel',JSON.stringify({filter,query}));}catch{}}
const TABS=[['all','Todos'],['groups','Grupos'],['priv','Privados'],['auto','Autónomos'],['mentions','Menciones'],['muted','Muteados']];
const tabsEl=document.getElementById('tabs');
function tabCount(k){if(k==='all')return chats.length;if(k==='groups')return chats.filter(c=>c.is_group).length;if(k==='priv')return chats.filter(c=>!c.is_group).length;if(k==='auto')return chats.filter(c=>c.autonomy_mode==='AUTONOMOUS').length;if(k==='mentions')return chats.filter(c=>c.autonomy_mode==='MENTIONS_ONLY').length;if(k==='muted')return chats.filter(c=>c.autonomy_mode==='SILENT').length;return 0;}
function paintTabs(){tabsEl.innerHTML='';TABS.forEach(([k,l])=>{const b=document.createElement('button');b.className='tab'+(k===filter?' act':'');b.setAttribute('role','tab');b.setAttribute('aria-selected',String(k===filter));b.dataset.k=k;b.innerHTML=esc(l)+'<span class=n>'+tabCount(k)+'</span>';b.onclick=()=>setFilter(k);tabsEl.appendChild(b);});}
paintTabs();
function setFilter(k){filter=k;limit=120;saveView();document.querySelectorAll('.tab').forEach(x=>{const on=x.dataset.k===k;x.classList.toggle('act',on);x.setAttribute('aria-selected',String(on));});render();}
if(query)document.getElementById('q').value=query;
function say(m){document.getElementById('live').textContent=m;}
let toastT=null;
function toast(m){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');say(m);clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),3200);}
let statusFails=0;
async function loadStatus(){try{const r=await fetch('/api/status');if(!r.ok)throw new Error('HTTP '+r.statusCode);const s=await r.json();
statusFails=0;document.getElementById('statusErr').classList.remove('show');
document.getElementById('sChats').textContent=s.total_chats??'–';
document.getElementById('sSes').textContent=s.active_sessions??'–';
document.getElementById('sLaya').textContent=s.laya_status??'–';
document.getElementById('sUp').textContent=s.watcher_uptime_human??'–';
const on=!!s.global_enabled;
const k=document.getElementById('kill');k.classList.toggle('off',!on);k.setAttribute('aria-pressed',String(on));
document.getElementById('ktx').textContent=on?'Prendido':'Apagado';
document.getElementById('sub').textContent=on?'bot activo':'bot en pausa global';
}catch(e){statusFails++;const el=document.getElementById('statusErr');document.getElementById('statusErrTx').textContent='Sin conexión con el panel (intento '+statusFails+'). Revisa que el watcher siga corriendo.';el.classList.add('show');say('Error de conexión con el panel.');if(statusFails<4)setTimeout(loadStatus,statusFails*2000);}}
async function loadChats(){try{const r=await fetch('/api/chats');if(!r.ok)throw new Error('HTTP '+r.statusCode);chats=await r.json();paintTabs();render();}catch{document.getElementById('list').innerHTML='<div class=card>⚠️ No se pudo cargar la lista de chats. <button class=reset onclick="loadChats()">Reintentar</button></div>';say('No se pudo cargar la lista de chats.');}}
function fmtT(t){if(!t)return'';try{return new Date(t.replace(' ','T')).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'});}catch{return t;}}
function filtered(){const q=query.toLowerCase();return chats.filter(c=>{
if(filter==='groups'&&!c.is_group)return false;
if(filter==='priv'&&c.is_group)return false;
if(filter==='auto'&&c.autonomy_mode!=='AUTONOMOUS')return false;
if(filter==='mentions'&&c.autonomy_mode!=='MENTIONS_ONLY')return false;
if(filter==='muted'&&c.autonomy_mode!=='SILENT')return false;
if(q&&!(String(c.name||'').toLowerCase().includes(q)||String(c.jid||'').toLowerCase().includes(q)))return false;
return true;});}
function modeClass(m){return m==='SILENT'?'silent':m==='AUTONOMOUS'?'auto':'ment';}
function segBtn(c,v,cls,label){return '<button type=button role=radio aria-pressed="'+(c.autonomy_mode===v)+'" data-j="'+esc(c.jid)+'" data-v="'+v+'" class="'+cls+'">'+label+'</button>';}
function render(){const el=document.getElementById('list');const all=filtered();const rows=all.slice(0,limit);
document.getElementById('count').textContent=all.length?('Mostrando '+rows.length+' de '+all.length):'Sin chats para este filtro';
const more=document.getElementById('more');more.style.display=all.length>rows.length?'':'none';more.textContent='Mostrar más ('+(all.length-rows.length)+' restantes)';
const bb=document.getElementById('bulkBar');bb.classList.toggle('show',selected.size>0);document.getElementById('bulkTx').textContent=selected.size+' seleccionados';document.getElementById('bulkSil').textContent='Silenciar '+selected.size;document.getElementById('bulkMen').textContent='Menciones '+selected.size;document.getElementById('bulkAuto').textContent='Auto '+selected.size;
el.innerHTML=rows.map((c,i)=>'<div class="card'+(c.autonomy_mode==='SILENT'?' is-silent':'')+'"><div class=row1><label class=selBox><input type=checkbox data-j="'+esc(c.jid)+'" class=sel '+(selected.has(c.jid)?'checked':'')+' aria-label="Seleccionar '+esc(c.name||c.jid)+'"></label><div class=nm>'+esc(c.name||c.jid)+'</div>'
+(c.is_group?'<span class="badge g">grupo</span>':'<span class="badge p">privado</span>')
+(c.is_marketplace?'<span class="badge mk">marketplace</span>':'')
+'<span class="badge '+modeClass(c.autonomy_mode)+'">'+(c.autonomy_mode==='SILENT'?'silencio':c.autonomy_mode==='AUTONOMOUS'?'auto':'menciones')+'</span></div>'
+'<div class=jid><span>'+esc(c.jid)+(c.last_message_time?' · '+fmtT(c.last_message_time):'')+(c.is_custom?' · personalizado':'')+'</span><button class=copyJid type=button data-j="'+esc(c.jid)+'" aria-label="Copiar JID">Copiar</button></div>'
+'<div class=ctl><div class=seg role=radiogroup aria-label="Modo de autonomía">'
+segBtn(c,'SILENT','m-silent','Silencio')+segBtn(c,'MENTIONS_ONLY','m-ment','Menciones')+segBtn(c,'AUTONOMOUS','m-auto','Auto')
+'</div>'
+'<details class=more><summary>··· Más (Notion, Media, Reposo)</summary><div class=moreRow>'
+'<label class=mini title="Guarda en Second Brain"><input type=checkbox data-j="'+esc(c.jid)+'" class=notion '+(c.allow_notion?'checked':'')+'> Notion · guarda</label>'
+'<label class=mini title="Permite fotos y audio"><input type=checkbox data-j="'+esc(c.jid)+'" class=media '+(c.allow_media?'checked':'')+'> Media · fotos</label>'
+'<button class=reset data-j="'+esc(c.jid)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 2 6"/><path d="M4 4v6h6"/></svg>Reposo</button></div></details></div></div>').join('')
||'<div class="card empty"><b>Nada por aquí :3</b><p>No hay chats con este filtro. Prueba otra búsqueda o limpia los filtros.</p><button type=button onclick="clearAllFilters()">Limpiar búsqueda y filtros</button></div>';
el.querySelectorAll('button.copyJid').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.j);b.textContent='¡Copiado!';say('JID copiado.');setTimeout(()=>b.textContent='Copiar',1200);}catch{toast('No se pudo copiar el JID.');}});
el.querySelectorAll('input.sel').forEach(c=>c.onchange=()=>{if(c.checked)selected.add(c.dataset.j);else selected.delete(c.dataset.j);render();});
el.querySelectorAll('.seg button').forEach(s=>s.onclick=()=>updateChat(s.dataset.j,{autonomy_mode:s.dataset.v},s));
el.querySelectorAll('input.notion').forEach(c=>c.onchange=()=>updateChat(c.dataset.j,{allow_notion:c.checked?1:0},c));
el.querySelectorAll('input.media').forEach(c=>c.onchange=()=>updateChat(c.dataset.j,{allow_media:c.checked?1:0},c));
el.querySelectorAll('button.reset').forEach(b=>b.onclick=async()=>{const orig=b.innerHTML;const jid=b.dataset.j;b.disabled=true;try{const r=await fetch('/api/chats/'+encodeURIComponent(jid)+'/reset',{method:'POST'});if(!r.ok)throw new Error('HTTP '+r.statusCode);const d=await r.json().catch(()=>({}));if(d.ok===false)throw new Error('reset rechazado');b.innerHTML='✓ Reposo';say('Chat en reposo. Sesión reiniciada.');setTimeout(()=>{b.innerHTML=orig;b.disabled=false;},1200);}catch(e){b.innerHTML=orig;b.disabled=false;toast('No se pudo poner en reposo. Intenta de nuevo.');}});
}
function esc(s){return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
const pendingChats=new Set();
async function updateChat(jid,patch,el){if(pendingChats.has(jid))return;pendingChats.add(jid);const i=chats.findIndex(c=>c.jid===jid);const prev=i>=0?{...chats[i]}:null;if(el)el.disabled=true;
try{const r=await fetch('/api/chats/'+encodeURIComponent(jid),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});if(!r.ok)throw new Error('HTTP '+r.statusCode);const u=await r.json();if(i>=0)chats[i]={...chats[i],...u};paintTabs();render();if(patch.autonomy_mode==='AUTONOMOUS'){toast('¡En auto! Escucha ambiental :3');const btn=document.querySelector('.seg button.m-auto[aria-pressed="true"]');if(btn){btn.classList.add('pop');setTimeout(()=>btn.classList.remove('pop'),350);}}else say('Chat actualizado.');
}catch(e){if(i>=0&&prev)chats[i]=prev;render();toast('No se guardó el cambio. Se revirtió.');}finally{pendingChats.delete(jid);}}
function clearAllFilters(){filter='all';query='';limit=120;selected.clear();document.getElementById('q').value='';saveView();syncClear();setFilter('all');say('Filtros limpios.');}
function syncClear(){document.getElementById('clearQ').classList.toggle('show',!!query);}
document.getElementById('q').oninput=e=>{query=e.target.value;limit=120;saveView();syncClear();render();};
document.getElementById('clearQ').onclick=()=>{query='';document.getElementById('q').value='';limit=120;saveView();syncClear();render();document.getElementById('q').focus();say('Búsqueda limpia.');};
syncClear();
document.getElementById('more').onclick=()=>{limit+=200;render();say(document.getElementById('count').textContent);};
async function bulkSet(mode){if(!selected.size)return;const jids=[...selected];let ok=0,fail=0;for(const jid of jids){try{const r=await fetch('/api/chats/'+encodeURIComponent(jid),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({autonomy_mode:mode})});if(!r.ok)throw new Error();const u=await r.json();const i=chats.findIndex(c=>c.jid===jid);if(i>=0)chats[i]={...chats[i],...u};ok++;}catch{fail++;}}selected.clear();paintTabs();render();toast(ok+' actualizados'+(fail?' · '+fail+' fallaron':''));say(ok+' chats actualizados en lote.');}
document.getElementById('bulkSil').onclick=()=>bulkSet('SILENT');
document.getElementById('bulkMen').onclick=()=>bulkSet('MENTIONS_ONLY');
document.getElementById('bulkAuto').onclick=()=>bulkSet('AUTONOMOUS');
document.getElementById('bulkClear').onclick=()=>{selected.clear();render();};
document.getElementById('retryBtn').onclick=()=>{statusFails=0;loadStatus();loadChats();};
let killArmed=false,killTimer=null,undoTimer=null,undoPrev=null;
function setKillUI(on){const k=document.getElementById('kill');k.classList.toggle('off',!on);k.setAttribute('aria-pressed',String(on));document.getElementById('ktx').textContent=on?'Prendido':'Apagado';document.getElementById('sub').textContent=on?'bot activo':'bot en pausa global';}
function showUndo(prev){undoPrev=prev;const u=document.getElementById('undo');document.getElementById('undoTx').textContent=prev?'Bot apagado. Nada se envía.':'Bot prendido de nuevo :3';u.classList.add('show');const btn=document.getElementById('undoBtn');let s=10;btn.textContent='Deshacer ('+s+'s)';clearInterval(undoTimer);undoTimer=setInterval(()=>{s--;if(s<=0){clearInterval(undoTimer);u.classList.remove('show');}else btn.textContent='Deshacer ('+s+'s)';},1000);}
document.getElementById('undoBtn').onclick=async()=>{clearInterval(undoTimer);document.getElementById('undo').classList.remove('show');try{const r=await fetch('/api/status/toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:undoPrev})});if(!r.ok)throw new Error();loadStatus();say(undoPrev?'Bot apagado.':'Bot prendido :3');}catch{toast('No se pudo deshacer. Revisa el panel.');}};
document.getElementById('kill').onclick=async()=>{const k=document.getElementById('kill');const isOn=document.getElementById('ktx').textContent==='Prendido';
if(!killArmed){killArmed=true;k.classList.add('armed');document.getElementById('ktx').textContent=isOn?'¿Apagar?':'¿Prender?';say(isOn?'Toca de nuevo para apagar el bot global.':'Toca de nuevo para prender el bot.');clearTimeout(killTimer);killTimer=setTimeout(()=>{killArmed=false;k.classList.remove('armed');loadStatus();},4000);return;}
clearTimeout(killTimer);killArmed=false;k.classList.remove('armed');k.disabled=true;
try{const r=await fetch('/api/status/toggle',{method:'POST'});if(!r.ok)throw new Error('HTTP '+r.statusCode);const d=await r.json().catch(()=>({}));const on=d.global_enabled!==undefined?!!d.global_enabled:!isOn;setKillUI(on);showUndo(!on);say(on?'Bot prendido :3':'Bot apagado global. Tienes 10 segundos para deshacer.');loadStatus();}catch(e){toast('No se pudo cambiar el interruptor. Intenta de nuevo.');loadStatus();}finally{k.disabled=false;}};
loadStatus();loadChats();setInterval(loadStatus,15000);setInterval(loadChats,60000);
</script>
</body></html>`;

async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // GET / -> SPA
  if (url.pathname === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(SPA_HTML);
    return;
  }

  // GET /api/status
  if (url.pathname === '/api/status' && req.method === 'GET') {
    const status = await buildStatus();
    sendJson(res, 200, status);
    return;
  }

  // POST /api/status/toggle  {enabled?: bool}
  if (url.pathname === '/api/status/toggle' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      let next;
      if (body && body.enabled !== undefined) {
        next = permissions.setGlobalEnabled(!!body.enabled && body.enabled !== '0' && body.enabled !== 0);
      } else {
        next = permissions.setGlobalEnabled(!permissions.isGlobalEnabled());
      }
      sendJson(res, 200, { global_enabled: next });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /api/chats
  if (url.pathname === '/api/chats' && req.method === 'GET') {
    try {
      const list = permissions.getAllChatsWithPermissions();
      sendJson(res, 200, list);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // PUT /api/chats/:jid  |  POST /api/chats/:jid/reset
  if (url.pathname.startsWith('/api/chats/')) {
    const rest = url.pathname.slice('/api/chats/'.length);
    const parts = rest.split('/');
    const jid = decodeURIComponent(parts[0] || '');
    if (!jid) {
      sendJson(res, 400, { error: 'JID requerido' });
      return;
    }

    if (req.method === 'POST' && parts[1] === 'reset') {
      const ok = permissions.resetChatSession(jid);
      sendJson(res, 200, { ok, jid });
      return;
    }

    if (req.method === 'PUT') {
      try {
        const body = await readBody(req);
        const updated = permissions.setChatPermission(jid, {
          autonomy_mode: body.autonomy_mode,
          allow_notion: body.allow_notion,
          allow_media: body.allow_media,
          chat_name: body.chat_name
        });
        sendJson(res, 200, updated);
      } catch (err) {
        const code = err instanceof RangeError || err instanceof TypeError ? 400 : 500;
        sendJson(res, code, { error: err.message });
      }
      return;
    }
  }

  sendJson(res, 404, { error: 'Not found' });
}

function startDashboardServer(opts = {}) {
  const port = opts.port ?? DEFAULT_PORT;
  if (serverInstance) return serverInstance;
  const server = http.createServer(handler);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`🎛️ [DASHBOARD] Puerto ${port} ocupado, panel no iniciado (el watcher sigue corriendo).`);
    } else {
      console.error('🎛️ [DASHBOARD] Error:', err.message);
    }
  });
  server.listen(port, '0.0.0.0', () => {
    console.log(`🎛️ [DASHBOARD] Panel de control en http://localhost:${port} (LAN: http://<IP-LOCAL>:${port})`);
  });
  serverInstance = server;
  return server;
}

function _resetForTests() {
  try { if (serverInstance) serverInstance.close(); } catch {}
  serverInstance = null;
}

module.exports = {
  startDashboardServer,
  buildStatus,
  handler,
  DEFAULT_PORT,
  _resetForTests
};
