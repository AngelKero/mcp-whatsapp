/**
 * voice-synthesizer.js
 * Módulo 3: Respuestas con Notas de Voz Reales (TTS Local con voz Paulina de macOS)
 *
 * Aplica técnicas de la skill 'humanizer' para preprocesar fonéticamente el texto
 * inyectando cadencia, pausas de respiración y modismos conversacionales mexicanos
 * antes de alimentar 'say -v Paulina' y convertir a Opus PTT para WhatsApp.
 */

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { sendFile } = require('../../mcp-client.js');

const SAY_BIN = '/usr/bin/say';
const FFMPEG_BIN = fs.existsSync('/opt/homebrew/bin/ffmpeg')
  ? '/opt/homebrew/bin/ffmpeg'
  : (fs.existsSync('/usr/local/bin/ffmpeg') ? '/usr/local/bin/ffmpeg' : 'ffmpeg');

/**
 * Preprocesa y humaniza el texto para síntesis de voz natural con Paulina (es_MX)
 */
function humanizeForTTS(text, senderName = 'Angel') {
  if (!text) return '';

  let t = text;

  // 1. Quitar markdown de WhatsApp y código
  t = t.replace(/```[\s\S]*?```/g, 'un bloque de código adjunto en el chat')
       .replace(/`([^`]+)`/g, '$1')
       .replace(/[*_~]/g, '');

  // 2. Quitar enlaces y URLs
  t = t.replace(/https?:\/\/\S+/g, 'el enlace que te dejé en el chat');

  // 3. Quitar emoticonos clásicos y emojis para que Paulina no los deletree
  t = t.replace(/(?::3|xd|xD|XD|:\)|:D|:P|-_-|\(◕‿◕✿\)|;\))/g, '')
       .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');

  // 4. Fonetización de siglas y términos dev en español mexicano
  t = t.replace(/\bAPI\b/g, 'ápi')
       .replace(/\bAPIs\b/g, 'ápis')
       .replace(/\bBD\b/g, 'base de datos')
       .replace(/\bBDs\b/g, 'bases de datos')
       .replace(/\bPR\b/g, 'pull request')
       .replace(/\bUI\b/g, 'interfaz')
       .replace(/\bCLI\b/g, 'línea de comandos')
       .replace(/\bCUCEA\b/g, 'cucea')
       .replace(/\bUdeG\b/g, 'u de g')
       .replace(/\bTI\b/g, 'tecnologías de la información')
       .replace(/\bJSON\b/g, 'yeison')
       .replace(/\bJS\b/g, 'yavaskript')
       .replace(/\bTS\b/g, 'taipskript')
       .replace(/\bCSS\b/g, 'estilos')
       .replace(/\bHTML\b/g, 'hache te eme ele')
       .replace(/\bNode\.?js\b/gi, 'noud yeies')
       .replace(/\bNotion\b/g, 'nóushon')
       .replace(/\bWhatsApp\b/gi, 'guasap')
       .replace(/\bgit\b/gi, 'guit')
       .replace(/\bmcp\b/gi, 'eme ce pe');

  // 5. Normalizar numeraciones y listas tipo bot para habla oral
  t = t.replace(/^\s*[•\-\*]\s+/gm, 'También, ')
       .replace(/^\s*\d+[\.\)]\s+/gm, '');

  // 6. Inyectar pausas de respiración oral (comas tras oraciones y conectores)
  t = t.replace(/([.!?])\s+/g, '$1 , ')
       .replace(/\s*,\s*,+/g, ', ')
       .replace(/\s+/g, ' ')
       .trim();

  // 7. Si el texto suena muy frío o telegráfico, añadir apertura natural de compa dev
  if (senderName === 'Angel' && !/^(oye|hola|qué onda|buen|va|listo)/i.test(t)) {
    t = `Oye Ángel, , ${t}`;
  } else if (senderName === 'Erika' && !/^(hola|oye|hermosa|linda)/i.test(t)) {
    t = `Hola Erika, , ${t}`;
  }

  return t;
}

/**
 * Sintetiza un texto a archivo de audio Opus listo para WhatsApp PTT
 */
async function synthesizeVoiceNote(text, options = {}) {
  const {
    senderName = 'Angel',
    voice = 'Paulina',
    rate = 185, // Velocidad natural ligeramente relajada
    tempDir = os.tmpdir()
  } = options;

  const spokenText = humanizeForTTS(text, senderName);
  const stamp = Date.now();
  const aiffPath = path.join(tempDir, `tts_${stamp}.aiff`);
  const oggPath = path.join(tempDir, `ptt_${stamp}.ogg`);

  // Paso 1: Generar AIFF nativo con say
  await new Promise((resolve, reject) => {
    execFile(SAY_BIN, ['-v', voice, '-r', String(rate), spokenText, '-o', aiffPath], (err, stdout, stderr) => {
      if (err) return reject(new Error(`Error en say: ${err.message}`));
      resolve();
    });
  });

  // Paso 2: Convertir a Opus compatible con WhatsApp Voice Note (PTT)
  await new Promise((resolve, reject) => {
    const ffmpegArgs = [
      '-y',
      '-i', aiffPath,
      '-c:a', 'libopus',
      '-b:a', '32k',
      '-vbr', 'on',
      '-application', 'voip',
      oggPath
    ];

    execFile(FFMPEG_BIN, ffmpegArgs, (err, stdout, stderr) => {
      // Limpiar AIFF temporal
      try { fs.unlinkSync(aiffPath); } catch {}

      if (err) return reject(new Error(`Error en ffmpeg: ${err.message}`));
      resolve();
    });
  });

  return {
    oggPath,
    spokenText,
    cleanup: () => {
      try { if (fs.existsSync(oggPath)) fs.unlinkSync(oggPath); } catch {}
    }
  };
}

module.exports = {
  humanizeForTTS,
  synthesizeVoiceNote
};
