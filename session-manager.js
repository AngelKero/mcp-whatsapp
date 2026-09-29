const path = require('path');
const { exec, execFile } = require('child_process');
const { classifyClosingMessage } = require('./system-one-client.js');
const { DatabaseSync } = require('node:sqlite');
const chatHistorySearch = require('./modules/search/chat-history-search.js');
const { isChatHistoryQuestion, pickModel } = require('./system-one-client.js');

const DB_PATH = path.join(__dirname, 'store', 'sessions.db');
const AGY_BIN = '/Users/angelzaragoza/.local/bin/agy';
const ACTIVE_DECAY_MS = 5 * 60 * 1000; // 5 minutos de ventana activa para respuestas continuas antes de decaer a LURK_MODE
const SESSION_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutos para expirar a IDLE

// Expresión regular para detectar cierre voluntario de conversación
// NOTE: CLOSING_PATTERNS regex removed – closing detection now uses Laya classifier classifyClosingMessage

const NOTION_CONTEXT = `
REGLA MANDATORIA DE RIGOR (CERO ALUCINACIONES):
- NUNCA afirmes ni finjas haber guardado, registrado o agendado una tarea, recordatorio o gasto si no ejecutaste una herramienta real que lo confirme.
- La memoria central de Angel es Notion (Second Brain). La jerarquía es Life Pillar -> Proyecto -> Tareas.
- Si el usuario te pide registrar o consultar algo, usa las herramientas o notion-actions.js:
  * Tareas DB: 249853a1-d77e-80b3-9e5c-eca51f834edf (Estado: No iniciado, En progreso, Hecho)
  * Transacciones DB: 3e6853a1-d77e-81c9-ab0e-d1e8b37a55b1
  * Notas DB: 249853a1-d77e-801f-807b-d397eefafcb9
  * Proyectos DB: 255853a1-d77e-8007-be4e-c78abeb94072
`;

class SessionManager {
  constructor(timeoutMs = SESSION_TIMEOUT_MS, activeDecayMs = ACTIVE_DECAY_MS) {
    this.timeoutMs = timeoutMs;
    this.activeDecayMs = activeDecayMs;
    this.db = new DatabaseSync(DB_PATH);
    this.initDb();
  }

  initDb() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_sessions (
        chat_jid TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        state TEXT DEFAULT 'IDLE',
        last_active_timestamp INTEGER,
        last_interaction_timestamp INTEGER,
        last_timestamp INTEGER NOT NULL,
        sender_name TEXT,
        is_active INTEGER DEFAULT 1
      )
    `);

    // Migración no destructiva si la tabla existía con esquema previo
    try { this.db.exec("ALTER TABLE ai_sessions ADD COLUMN state TEXT DEFAULT 'IDLE'"); } catch {}
    try { this.db.exec("ALTER TABLE ai_sessions ADD COLUMN last_active_timestamp INTEGER"); } catch {}
    try { this.db.exec("ALTER TABLE ai_sessions ADD COLUMN last_interaction_timestamp INTEGER"); } catch {}

    // Tabla de buffer pasivo para modo chismoso (LURK_MODE)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ambient_buffer (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_jid TEXT NOT NULL,
        msg_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        sender_name TEXT,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_ambient_chat_time ON ambient_buffer(chat_jid, timestamp)`);
  }

  getSessionState(chatJid) {
    const row = this.db.prepare(
      'SELECT conversation_id, last_timestamp, state, last_active_timestamp, last_interaction_timestamp, sender_name, is_active FROM ai_sessions WHERE chat_jid = ?'
    ).get(chatJid);

    if (!row || row.is_active === 0) {
      return { state: 'IDLE', conversation_id: null, sender_name: null };
    }

    const now = Date.now();
    const activeTime = row.last_active_timestamp || row.last_timestamp || now;
    const elapsedSinceActive = now - activeTime;

    // Si está en ACTIVE pero pasaron más de 90s sin turno directo, decae a LURK_MODE
    if ((row.state === 'ACTIVE' || !row.state) && elapsedSinceActive > this.activeDecayMs) {
      this.db.prepare("UPDATE ai_sessions SET state = 'LURK_MODE' WHERE chat_jid = ?").run(chatJid);
      row.state = 'LURK_MODE';
    }

    // Si está en LURK_MODE pero pasaron más de 20 minutos de inactividad, expira a IDLE
    if (row.state === 'LURK_MODE' && elapsedSinceActive > this.timeoutMs) {
      this.closeSession(chatJid);
      return { state: 'IDLE', conversation_id: null, sender_name: null };
    }

    return {
      state: row.state || 'IDLE',
      conversation_id: row.conversation_id,
      sender_name: row.sender_name,
      elapsedSinceActive,
      last_active_timestamp: activeTime
    };
  }

  setSessionState(chatJid, state, senderName = null, conversationId = null) {
    const now = Date.now();
    const current = this.getActiveSession(chatJid);
    const convId = conversationId || current?.conversation_id || 'conv-' + now;

    this.db.prepare(`
      INSERT INTO ai_sessions (chat_jid, conversation_id, state, last_active_timestamp, last_interaction_timestamp, last_timestamp, sender_name, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(chat_jid) DO UPDATE SET
        conversation_id = excluded.conversation_id,
        state = excluded.state,
        last_active_timestamp = CASE WHEN excluded.state = 'ACTIVE' THEN excluded.last_active_timestamp ELSE ai_sessions.last_active_timestamp END,
        last_interaction_timestamp = excluded.last_interaction_timestamp,
        last_timestamp = excluded.last_timestamp,
        sender_name = COALESCE(excluded.sender_name, ai_sessions.sender_name),
        is_active = 1
    `).run(chatJid, convId, state, now, now, now, senderName);
  }

  recordAmbientMessage(chatJid, msgId, sender, senderName, content) {
    if (!content || !content.trim()) return;
    const now = Date.now();
    try {
      this.db.prepare(`
        INSERT INTO ambient_buffer (chat_jid, msg_id, sender, sender_name, content, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(chatJid, msgId || 'msg-' + now, sender || '', senderName || '', content.trim(), now);

      // Mantener máximo 20 mensajes recientes por chat para evitar saturación
      this.db.prepare(`
        DELETE FROM ambient_buffer WHERE chat_jid = ? AND id NOT IN (
          SELECT id FROM ambient_buffer WHERE chat_jid = ? ORDER BY timestamp DESC LIMIT 20
        )
      `).run(chatJid, chatJid);
    } catch (err) {
      console.error('[AMBIENT BUFFER] Error registrando mensaje:', err.message);
    }
  }

  getAmbientContext(chatJid, limit = 10) {
    try {
      const rows = this.db.prepare(`
        SELECT sender_name, content, timestamp FROM ambient_buffer
        WHERE chat_jid = ?
        ORDER BY timestamp ASC
        LIMIT ?
      `).all(chatJid, limit);

      if (!rows || rows.length === 0) return '';
      return rows.map(r => `[${r.sender_name || 'Humano'}]: "${r.content.replace(/\n+/g, ' ')}"`).join('\n');
    } catch {
      return '';
    }
  }

  clearAmbientBuffer(chatJid) {
    try {
      this.db.prepare('DELETE FROM ambient_buffer WHERE chat_jid = ?').run(chatJid);
    } catch {}
  }

  getActiveSession(chatJid) {
    const sessionState = this.getSessionState(chatJid);
    if (!sessionState || sessionState.state === 'IDLE') return null;

    return {
      conversation_id: sessionState.conversation_id,
      state: sessionState.state,
      sender_name: sessionState.sender_name,
      is_active: 1
    };
  }

  saveOrUpdateSession(chatJid, conversationId, senderName) {
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO ai_sessions (chat_jid, conversation_id, state, last_active_timestamp, last_interaction_timestamp, last_timestamp, sender_name, is_active)
      VALUES (?, ?, 'ACTIVE', ?, ?, ?, ?, 1)
      ON CONFLICT(chat_jid) DO UPDATE SET
        conversation_id = excluded.conversation_id,
        state = 'ACTIVE',
        last_active_timestamp = excluded.last_active_timestamp,
        last_interaction_timestamp = excluded.last_interaction_timestamp,
        last_timestamp = excluded.last_timestamp,
        sender_name = excluded.sender_name,
        is_active = 1
    `).run(chatJid, conversationId, now, now, now, senderName);
  }

  updateActivity(chatJid) {
    const now = Date.now();
    this.db.prepare(`
      UPDATE ai_sessions SET
        last_active_timestamp = ?,
        last_interaction_timestamp = ?,
        last_timestamp = ?
      WHERE chat_jid = ?
    `).run(now, now, now, chatJid);
  }

  closeSession(chatJid) {
    this.db.prepare("UPDATE ai_sessions SET is_active = 0, state = 'IDLE' WHERE chat_jid = ?").run(chatJid);
    this.clearAmbientBuffer(chatJid);
  }

  async isClosingMessage(text) {
  if (!text) return false;
  try {
    return await classifyClosingMessage(text);
  } catch (err) {
    console.error('[SESSION MANAGER] Error in classifyClosingMessage:', err.message);
    return false;
  }
}

  /**
   * Ejecuta un turno conversacional con Antigravity (agy) manteniendo la conversación
   */
  async runConversationTurn(senderName, userMessage, isGroup = false, chatJid = '', contextHistory = '') {
    const activeSession = this.getActiveSession(chatJid);
    const convId = activeSession ? activeSession.conversation_id : null;

    let roleDescription = `Eres Antigravity (a quien también llaman o invocan con frecuencia como Jarvis o Gemini), una IA asistente inteligente, amigable y muy capaz que responde directamente por WhatsApp ${isGroup ? 'en un grupo de WhatsApp' : 'en un chat privado'}.`;

    if (senderName === 'Angel') {
      roleDescription += ` Quien te habla es Angel Zaragoza, tu creador y colega dev. Trátalo con confianza, tono relajado, sentido del humor de programador y emoticonos clásicos (:3, xd, etc.). Recuerda que su memoria central es Notion (Second Brain) y su jerarquía es Life Pillar -> Proyecto -> Tareas.`;
    } else if (senderName === 'Erika') {
      roleDescription += ` Quien te habla es Erika, la novia de Angel. Trátala con muchísimo cariño, amabilidad y buena vibra.`;
    } else {
      roleDescription += ` Quien te habla se llama ${senderName}. Trátalo con educación, amabilidad y sé muy claro y útil.`;
    }

    let historyBlock = '';
    if (contextHistory && contextHistory.trim()) {
      historyBlock = `\nContexto reciente del chat (últimos mensajes intercambiados para que entiendas de qué están hablando):\n${contextHistory.trim()}\n`;
    }

    // Detección RAG 100% semántica con Laya-MLX (Sistema 1 en GPU Metal)
    let ragBlock = '';
    let isHistory = false;
    try {
      isHistory = await isChatHistoryQuestion(userMessage);
    } catch (err) {
      console.error('[SESSION MANAGER] Error en Laya-MLX isChatHistoryQuestion:', err.message);
    }

    if (isHistory) {
      try {
        const searchResults = chatHistorySearch.search(userMessage, 4);
        if (searchResults && searchResults.length > 0) {
          ragBlock = `\nEVIDENCIA REAL RECUPERADA DE TU HISTORIAL DE WHATSAPP (Úsala para responder con total precisión fáctica y cero alucinaciones):\n`;
          searchResults.forEach((r, idx) => {
            ragBlock += `[Evidencia ${idx + 1}] Fecha: ${r.timestamp} | Chat/Grupo: ${r.chat_name || r.chat_jid} | Remitente: ${r.sender}: "${r.content}"\n`;
          });
          ragBlock += `\n`;
        }
      } catch (err) {
        console.error('[SESSION MANAGER] Error en recuperación RAG:', err.message);
      }
    }

    let ambientBlock = '';
    if (chatJid) {
      const ambientText = this.getAmbientContext(chatJid, 8);
      if (ambientText && ambientText.trim()) {
        ambientBlock = `\nContexto escuchado en segundo plano (plática previa de los usuarios mientras estabas en silencio):\n${ambientText.trim()}\n`;
      }
    }

    const fullPrompt = `${roleDescription}
${NOTION_CONTEXT}
DIRECTIVAS DE VOZ Y REDACCIÓN NATURAL (HUMANIZER):
- Escribe como una persona real conversando por WhatsApp: fluido, directo, fresco y con ritmo variado.
- CERO frases cliché de IA: "es importante destacar/señalar", "en conclusión", "un tapiz de", "sumergirse en", "desempeña un papel fundamental", "cabe mencionar", "un testimonio de".
- CERO gerundios de posterioridad ("hizo X, logrando Y" -> usa "hizo X y logró Y" o "lo que permitió").
- CERO paralelismos artificiales ("no es solo X, sino también Y") ni tríadas forzadas.
- CERO conclusiones redundantes de chatbot o despedidas de teletienda ("¡Espero haberte ayudado!", "¿En qué más puedo servirte?"). Cuando termines tu idea, para ahí.
- Rompe el metrónomo: combina oraciones cortas (3 a 7 palabras) con explicaciones fluidas. Evita bloques de texto homogéneos.
- Con Angel, mantén el tono de compa dev mexicano, relajado, inteligente y con emoticonos clásicos (:3, xd, etc.). Cero emojis corporativos (🚀, 💡, ✅).
- NUNCA agregues prefijos de metadatos tipo "[Confianza: Alta]", "[Confianza: Media]" ni etiquetas similares.
Instrucciones generales:
- Responde siempre en español.
- Sé conciso y directo (máximo 2 a 3 párrafos cortos, apto para leer en celular).
- Usa formato compatible con WhatsApp (negritas con un solo asterisco *texto*, no markdown de dos asteriscos).
${ragBlock}${historyBlock}${ambientBlock}
- Mensaje actual de ${senderName}: "${userMessage.replace(/"/g, '\\"')}"`;

    const args = [];
    if (convId) {
      args.push('--conversation', convId);
    }

    // 🧠 Laya-MLX elige el modelo óptimo según complejidad del mensaje (costo $0 local)
    const selectedModel = await pickModel(userMessage);
    args.push('--model', selectedModel, '-p', fullPrompt, '--output-format', 'json', '--dangerously-skip-permissions');

    return new Promise((resolve) => {
      execFile(AGY_BIN, args, {
        timeout: 90000,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: `/Users/angelzaragoza/.local/bin:/Users/angelzaragoza/.nvm/versions/node/v24.11.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`
        }
      }, (error, stdout, stderr) => {
        if (error) {
          console.error('[SESSION MANAGER] Error ejecutando agy:', error.message, stderr ? `Stderr: ${stderr}` : '');
          if (convId) {
            console.log(`[SESSION MANAGER] Reintentando agy sin conversation_id corrupta (${convId})...`);
            const retryArgs = ['--model', selectedModel, '-p', fullPrompt, '--output-format', 'json', '--dangerously-skip-permissions'];
            return execFile(AGY_BIN, retryArgs, {
              timeout: 90000,
              maxBuffer: 10 * 1024 * 1024,
              env: {
                ...process.env,
                PATH: `/Users/angelzaragoza/.local/bin:/Users/angelzaragoza/.nvm/versions/node/v24.11.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`
              }
            }, (retryErr, retryStdout) => {
              if (retryErr) {
                console.error('[SESSION MANAGER] Reintento falló también:', retryErr.message);
                return resolve({
                  reply: `¡Hola ${senderName}! Tuve un detalle procesando tu mensaje. ¿Me lo podrías repetir?`,
                  conversationId: null
                });
              }
              try {
                const parsed = JSON.parse(retryStdout.trim());
                const freshConvId = parsed.conversation_id;
                let replyText = parsed.response ? parsed.response.trim() : 'Listo :3';
                replyText = replyText.replace(/^\[Confianza:\s*(Alta|Media|Baja)\]\s*/i, '').trim();
                if (chatJid && freshConvId) {
                  this.saveOrUpdateSession(chatJid, freshConvId, senderName);
                  this.clearAmbientBuffer(chatJid);
                }
                return resolve({ reply: replyText, conversationId: freshConvId });
              } catch {
                return resolve({ reply: retryStdout.trim() || 'Listo :3', conversationId: null });
              }
            });
          }
          return resolve({
            reply: `¡Hola ${senderName}! Tuve un detalle procesando tu mensaje. ¿Me lo podrías repetir?`,
            conversationId: convId
          });
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          const newConvId = parsed.conversation_id || convId;
          let replyText = parsed.response ? parsed.response.trim() : 'Listo :3';
          replyText = replyText.replace(/^\[Confianza:\s*(Alta|Media|Baja)\]\s*/i, '').replace(/\[Confianza:\s*(Alta|Media|Baja)\]\s*/gi, '').trim();

          // Actualizar sesión con el conversation_id de agy
          if (chatJid && newConvId) {
            this.saveOrUpdateSession(chatJid, newConvId, senderName);
            this.clearAmbientBuffer(chatJid);
          }

          resolve({
            reply: replyText,
            conversationId: newConvId
          });
        } catch (e) {
          // Si stdout no fue JSON, usar stdout plano
          let rawText = stdout.trim() || '¡Entendido!';
          rawText = rawText.replace(/^\[Confianza:\s*(Alta|Media|Baja)\]\s*/i, '').replace(/\[Confianza:\s*(Alta|Media|Baja)\]\s*/gi, '').trim();
          resolve({
            reply: rawText,
            conversationId: convId
          });
        }
      });
    });
  }
}

module.exports = new SessionManager();
