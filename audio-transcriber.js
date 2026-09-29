#!/usr/bin/env node
/**
 * audio-transcriber.js
 * Transcribe archivos de audio de WhatsApp usando mlx_whisper en VoiceMCP venv
 */
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const PYTHON_BIN = '/Users/angelzaragoza/Library/Application Support/VoiceMCP/venv/bin/python3';

const SCRIPT_PATH = path.join(__dirname, 'scripts', 'transcribe-audio.py');

// Asegurar que exista scripts/
if (!fs.existsSync(path.join(__dirname, 'scripts'))) {
  fs.mkdirSync(path.join(__dirname, 'scripts'), { recursive: true });
}

// Script auxiliar de Python para transcripción con mlx_whisper
const pythonCode = `import sys
import json
import mlx_whisper

if len(sys.argv) < 2:
    print(json.dumps({"error": "No audio path provided"}))
    sys.exit(1)

audio_path = sys.argv[1]
try:
    result = mlx_whisper.transcribe(
        audio_path,
        path_or_hf_repo="mlx-community/whisper-tiny-mlx",
        language="es"
    )
    text = result.get("text", "").strip()
    print(json.dumps({"text": text}))
except Exception as e:
    # Intento de fallback sin especificar repo local
    try:
        result = mlx_whisper.transcribe(audio_path, language="es")
        text = result.get("text", "").strip()
        print(json.dumps({"text": text}))
    except Exception as e2:
        print(json.dumps({"error": str(e2)}))
        sys.exit(1)
`;

fs.writeFileSync(SCRIPT_PATH, pythonCode, 'utf-8');

class AudioTranscriber {
  async transcribe(audioPath) {
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Archivo de audio no encontrado: ${audioPath}`);
    }

    return new Promise((resolve, reject) => {
      execFile(PYTHON_BIN, [SCRIPT_PATH, audioPath], {
        timeout: 60000,
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`
        }
      }, (err, stdout, stderr) => {
        if (err) {
          console.error('[AUDIO TRANSCRIBER] Error en transcripción:', err.message, stderr);
          return resolve(null);
        }

        try {
          const res = JSON.parse(stdout.trim());
          if (res.error) {
            console.error('[AUDIO TRANSCRIBER] Error interno:', res.error);
            return resolve(null);
          }
          resolve(res.text || '');
        } catch (e) {
          resolve(stdout.trim());
        }
      });
    });
  }
}

module.exports = new AudioTranscriber();
