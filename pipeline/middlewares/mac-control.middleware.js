const { execSync, exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');
const mcpClient = require('../../mcp-client.js');

/**
 * pipeline/middlewares/mac-control.middleware.js
 * Módulo 1: SysAdmin Móvil & Control Remoto de macOS (!mac)
 *
 * Soporta comandos directos ejecutados localmente en Apple Silicon (M1):
 *   - !mac status / !mac bateria / !mac battery $\to$ Batería, RAM, disco, CPU y uptime.
 *   - !mac ping $\to$ Alerta sonora a máximo volumen con Ping.aiff para ubicar la Mac.
 *   - !mac lock $\to$ Bloqueo inmediato de sesión mediante pmset displaysleepnow.
 *   - !mac screen $\to$ Captura de pantalla silenciosa enviada como foto.
 *   - !mac help $\to$ Guía de uso.
 */

function getBatteryInfo() {
  try {
    const raw = execSync('pmset -g batt', { encoding: 'utf8' });
    const percentMatch = raw.match(/(\d+)%/);
    const percent = percentMatch ? parseInt(percentMatch[1], 10) : null;
    const isDischarging = /discharging/i.test(raw);
    const isAC = /AC Power|charging/i.test(raw) && !isDischarging;
    const timeMatch = raw.match(/(\d+:\d+)\s+remaining/);
    const remaining = timeMatch ? timeMatch[1] : null;

    let stateStr = isAC ? 'Conectada a corriente (Cargando)' : 'Descargando (Batería)';
    if (remaining) {
      stateStr += `, aprox. ${remaining.replace(':', 'h ')}m restantes`;
    }

    return { percent, isAC, isDischarging, remaining, stateStr };
  } catch (err) {
    return { percent: null, stateStr: 'No disponible', error: err.message };
  }
}

function getSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsedGB = (usedMem / (1024 ** 3)).toFixed(1);
  const memTotalGB = (totalMem / (1024 ** 3)).toFixed(1);
  const memFreeMB = Math.round(freeMem / (1024 ** 2));

  let diskUsedGB = '0';
  let diskFreeGB = '0';
  let diskTotalGB = '0';
  let diskPercent = 0;

  try {
    const stat = fs.statfsSync('/');
    const bsize = stat.bsize;
    const totalBytes = stat.blocks * bsize;
    const freeBytes = stat.bavail * bsize;
    const usedBytes = totalBytes - freeBytes;

    diskTotalGB = (totalBytes / (1024 ** 3)).toFixed(1);
    diskUsedGB = (usedBytes / (1024 ** 3)).toFixed(1);
    diskFreeGB = (freeBytes / (1024 ** 3)).toFixed(1);
    diskPercent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
  } catch {}

  const load = os.loadavg();
  const cpus = os.cpus().length;
  const cpuPercent = Math.min(100, Math.round((load[0] / cpus) * 100));

  const uptimeSeconds = os.uptime();
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  let uptimeStr = '';
  if (days > 0) uptimeStr += `${days} ${days === 1 ? 'día' : 'días'}, `;
  uptimeStr += `${hours} ${hours === 1 ? 'hora' : 'horas'} y ${minutes} min`;

  return {
    memUsedGB,
    memTotalGB,
    memFreeMB,
    diskUsedGB,
    diskFreeGB,
    diskTotalGB,
    diskPercent,
    cpuPercent,
    loadAvg: load.map(l => l.toFixed(2)).join(', '),
    uptimeStr
  };
}

module.exports = function createMacControlMiddleware(antiEcho, customSendReply = null, customSendMessage = null, customSendFile = null) {
  const replyFn = customSendReply || ((chatJid, body, msgId, senderJid = '') =>
    mcpClient.sendReplyOrFallback(chatJid, body, { messageId: msgId, senderJid, isGroup: !!senderJid }));
  const sendFn = customSendMessage || ((...args) => mcpClient.sendMessage(...args));
  const sendFileFn = customSendFile || ((...args) => mcpClient.sendFile(...args));

  return async function macControlMiddleware(ctx, next) {
    const { text, chatJid, sender, isGroup, msg, isMyOwnChat, isFromAngel } = ctx;

    const trimmed = (text || '').trim();
    const macMatch = trimmed.match(/^(?:[!/]mac)(?:\s+(.*))?$/i);
    if (!macMatch) {
      await next();
      return;
    }

    const subCommand = (macMatch[1] || 'status').trim().toLowerCase();
    console.log(`💻 [MAC CONTROL] Comando recibido en ${chatJid}: "!mac ${subCommand}"`);

    // Guard de seguridad: Solo Angel puede interactuar con el control de la Mac
    if (!isFromAngel && !isMyOwnChat) {
      const denyMsg = '⚠️ *[Acceso Denegado]*\nSolo Ángel puede consultar o ejecutar comandos en su Mac.';
      antiEcho.remember(denyMsg);
      if (isMyOwnChat) await sendFn(chatJid, denyMsg);
      else await replyFn(chatJid, denyMsg, msg.id, isGroup ? sender : '');
      return;
    }

    // 1. ESTATUS Y BATERÍA (!mac status, !mac bateria, !mac battery)
    if (['status', 'bateria', 'battery', 'stats', ''].includes(subCommand)) {
      const batt = getBatteryInfo();
      const sys = getSystemMetrics();

      const battLine = batt.percent !== null
        ? `🔋 *Batería:* ${batt.percent}% (${batt.stateStr})`
        : `🔋 *Batería:* No disponible`;

      const response = `💻 *ESTATUS DE TU MAC (Apple Silicon M1)*

${battLine}
⚡ *CPU & RAM:* CPU al ${sys.cpuPercent}% (Load: ${sys.loadAvg}) | RAM: ${sys.memUsedGB} GB / ${sys.memTotalGB} GB (Libre: ${sys.memFreeMB} MB)
💾 *Disco principal:* ${sys.diskUsedGB} GB usado / ${sys.diskFreeGB} GB libre (${sys.diskPercent}% ocupado)
⏱️ *Uptime:* ${sys.uptimeStr} prendida

Todo marchando estable sin sobrecalentamientos :3`;

      antiEcho.remember(response);
      if (isMyOwnChat) await sendFn(chatJid, response);
      else await replyFn(chatJid, response, msg.id, isGroup ? sender : '');
      return;
    }

    // 2. PING ACÚSTICO (!mac ping)
    if (subCommand === 'ping') {
      try {
        exec('osascript -e "set volume output volume 100" && afplay /System/Library/Sounds/Ping.aiff', () => {});
        const pingMsg = '🔊 *[Ping Acústico Disparado]*\nHe puesto el volumen al 100% y reproducido la alerta sonora en tu Mac para que la encuentres 🔔 :3';
        antiEcho.remember(pingMsg);
        if (isMyOwnChat) await sendFn(chatJid, pingMsg);
        else await replyFn(chatJid, pingMsg, msg.id, isGroup ? sender : '');
      } catch (err) {
        const errMsg = `⚠️ Error reproduciendo ping: ${err.message}`;
        if (isMyOwnChat) await sendFn(chatJid, errMsg);
        else await replyFn(chatJid, errMsg, msg.id, isGroup ? sender : '');
      }
      return;
    }

    // 3. BLOQUEO DE SESIÓN (!mac lock)
    if (subCommand === 'lock') {
      try {
        exec('pmset displaysleepnow', () => {});
        const lockMsg = '🔒 *[Mac Bloqueada]*\nPantalla puesta a dormir y sesión bloqueada de inmediato :3';
        antiEcho.remember(lockMsg);
        if (isMyOwnChat) await sendFn(chatJid, lockMsg);
        else await replyFn(chatJid, lockMsg, msg.id, isGroup ? sender : '');
      } catch (err) {
        const errMsg = `⚠️ Error bloqueando pantalla: ${err.message}`;
        if (isMyOwnChat) await sendFn(chatJid, errMsg);
        else await replyFn(chatJid, errMsg, msg.id, isGroup ? sender : '');
      }
      return;
    }

    // 4. CAPTURA DE PANTALLA (!mac screen)
    if (subCommand === 'screen' || subCommand === 'screenshot') {
      const tempScreenPath = path.join('/tmp', `mac_screen_${Date.now()}.png`);
      exec(`screencapture -x "${tempScreenPath}"`, async (error) => {
        if (error || !fs.existsSync(tempScreenPath)) {
          const errMsg = '⚠️ *[Captura no disponible]*\nNo se pudo capturar la pantalla (es posible que la Mac esté bloqueada o requiera permisos de Grabación de Pantalla en Ajustes del Sistema).';
          antiEcho.remember(errMsg);
          if (isMyOwnChat) await sendFn(chatJid, errMsg);
          else await replyFn(chatJid, errMsg, msg.id, isGroup ? sender : '');
          return;
        }

        try {
          await sendFileFn(chatJid, tempScreenPath);
          try { fs.unlinkSync(tempScreenPath); } catch {}
        } catch (sendErr) {
          console.error('[MAC SCREEN] Error enviando imagen:', sendErr.message);
          const errMsg = `⚠️ Error enviando captura por WhatsApp: ${sendErr.message}`;
          if (isMyOwnChat) await sendFn(chatJid, errMsg);
          else await replyFn(chatJid, errMsg, msg.id, isGroup ? sender : '');
        }
      });
      return;
    }

    // 5. AYUDA / MANUAL (!mac help o subcomando desconocido)
    const helpMsg = `💻 *COMANDOS SYSADMIN MACOS (!mac)*
══════════════════════════════
• *!mac status* o *!mac bateria* $\\to$ Batería, CPU, RAM, disco y uptime en tiempo real.
• *!mac ping* $\\to$ Alerta sonora a máximo volumen para encontrar tu Mac traspapelada.
• *!mac lock* $\\to$ Bloquea la sesión y apaga la pantalla al instante.
• *!mac screen* $\\to$ Captura de pantalla silenciosa enviada por WhatsApp.
• *!mac help* $\\to$ Muestra este menú de ayuda :3`;

    antiEcho.remember(helpMsg);
    if (isMyOwnChat) await sendFn(chatJid, helpMsg);
    else await replyFn(chatJid, helpMsg, msg.id, isGroup ? sender : '');
  };
};
