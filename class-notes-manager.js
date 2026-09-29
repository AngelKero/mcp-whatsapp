#!/usr/bin/env node
/**
 * class-notes-manager.js
 * Coordinador integral de Apuntes de Clase con Whisper + Notion + WhatsApp + CLI de macOS.
 *
 * Funcionalidades:
 * 1. Auto-resolución de materia según el horario oficial de CUCEA (2026B).
 * 2. Control de grabación del micrófono con Whisper Small MLX (start, status, stop).
 * 3. Síntesis pedagógica estructurada con IA (Resumen, Temas, Conceptos, Tareas, Puntos Clave).
 * 4. Doble inserción en Notion:
 *    - En DB 'Notas' con Tipo 'Clase' y relación a Materias y Pilar Universidad.
 *    - Bloque de acceso rápido dentro de la página de la Materia.
 * 5. Creación automática de tareas detectadas en DB 'Tareas' (Prioridad Alta 🔥).
 * 6. Interfaz unificada para WhatsApp y comando de macOS (`clase`).
 */

const path = require('path');
const fs = require('fs');
const { execFile, execSync } = require('child_process');
const { notionRequest } = require('./notion-queue.js');
const { DATABASES, LIFE_PILLARS } = require('./config/notion-schemas.js');
const { BINARIES } = require('./config/env.js');
const scheduleResolver = require('./modules/academic/schedule-resolver.js');
const notionNotesBuilder = require('./modules/academic/notion-notes-builder.js');

const PYTHON_BIN = BINARIES.PYTHON_VOICE;
const TRANSCRIBER_SCRIPT = BINARIES.TRANSCRIBER_SCRIPT;
const AGY_BIN = BINARIES.AGY_BIN;
const TRANSCRIPTIONS_DIR = path.resolve(process.env.HOME, 'Documents/Transcripciones');

const PILAR_UNIVERSIDAD = LIFE_PILLARS.UNIVERSIDAD.id;

// Mapeo exhaustivo de materias activas cursadas (2026B)
const MATERIAS_MAP = {
  '24a853a1-d77e-80ec-bf20-e4fe770d19b2': {
    name: 'Programación WEB',
    aliases: ['web', 'programacion web', 'programación web', 'fregoso', 'raul'],
    aula: 'I204',
    prof: 'Raúl Armando González Fregoso'
  },
  '24a853a1-d77e-8025-9f0d-f27304f4840d': {
    name: 'Sistema de base de datos II',
    aliases: ['bases de datos', 'base de datos', 'bd', 'bd2', 'martha', 'bases de datos 2'],
    aula: 'I203',
    prof: 'Martha Patricia Martínez Vargas'
  },
  '24a853a1-d77e-8056-b6cc-e40fe1c1cbfb': {
    name: 'Fundamentos de redes',
    aliases: ['redes', 'fundamentos de redes', 'claustro', 'telecomunicaciones', 'cisco'],
    aula: 'L202',
    prof: 'Javier Claustro Bobadilla'
  },
  '24a853a1-d77e-8088-8d79-efd519fb7db5': {
    name: 'Inteligencia de negocios',
    aliases: ['inteligencia de negocios', 'bi', 'business intelligence', 'guiza', 'omar'],
    aula: 'L102',
    prof: 'Roberto Omar Rodríguez Guiza'
  },
  '24a853a1-d77e-80d3-8c05-e04170ebb809': {
    name: 'Ingeniería de software',
    aliases: ['software', 'ingenieria de software', 'ingeniería de software', 'duran', 'hector'],
    aula: 'I204',
    prof: 'Héctor Alejandro Durán Limón'
  },
  '24a853a1-d77e-80be-9d0b-ffa2a40bb0dc': {
    name: 'Administración de proyectos TI',
    aliases: ['admin proyectos', 'administracion de proyectos', 'administración de proyectos ti', 'muñoz', 'daniel'],
    aula: 'I108',
    prof: 'Eduardo Daniel Muñoz Hernández'
  },
  '24a853a1-d77e-80c2-a2b1-eab3662e0fa3': {
    name: 'Gestión de servicios y procesos TI II',
    aliases: ['gestion 2', 'gestion de ti', 'gestión', 'gestion', 'lopez campos', 'jorge'],
    aula: 'L204',
    prof: 'Jorge Enrique López Campos'
  },
  '24a853a1-d77e-806c-827e-f0418adc2d9c': {
    name: 'Big data',
    aliases: ['big data', 'datos masivos', 'barbosa', 'liliana'],
    aula: 'L207',
    prof: 'Liliana Ibeth Barbosa Santillán'
  }
};

// Horario oficial de CUCEA (Lunes a Viernes)
const WEEKLY_SCHEDULE = {
  1: [ // Lunes
    { start: '14:00', end: '16:00', id: '24a853a1-d77e-80be-9d0b-ffa2a40bb0dc' },
    { start: '18:00', end: '20:00', id: '24a853a1-d77e-8088-8d79-efd519fb7db5' }
  ],
  2: [ // Martes
    { start: '09:00', end: '11:00', id: '24a853a1-d77e-80ec-bf20-e4fe770d19b2' },
    { start: '11:00', end: '13:00', id: '24a853a1-d77e-8025-9f0d-f27304f4840d' },
    { start: '16:00', end: '18:00', id: '24a853a1-d77e-8056-b6cc-e40fe1c1cbfb' },
    { start: '18:00', end: '20:00', id: '24a853a1-d77e-80d3-8c05-e04170ebb809' }
  ],
  3: [ // Miércoles
    { start: '18:00', end: '20:00', id: '24a853a1-d77e-8088-8d79-efd519fb7db5' }
  ],
  4: [ // Jueves
    { start: '09:00', end: '11:00', id: '24a853a1-d77e-80ec-bf20-e4fe770d19b2' },
    { start: '11:00', end: '13:00', id: '24a853a1-d77e-8025-9f0d-f27304f4840d' },
    { start: '16:00', end: '18:00', id: '24a853a1-d77e-8056-b6cc-e40fe1c1cbfb' },
    { start: '18:00', end: '20:00', id: '24a853a1-d77e-80d3-8c05-e04170ebb809' }
  ],
  5: [ // Viernes
    { start: '11:00', end: '15:00', id: '24a853a1-d77e-806c-827e-f0418adc2d9c' },
    { start: '18:00', end: '20:00', id: '24a853a1-d77e-80c2-a2b1-eab3662e0fa3' }
  ]
};

class ClassNotesManager {
  /**
   * Resuelve la materia actual o solicitada delegando al ScheduleResolver
   */
  resolveSubject(requestedText = '') {
    return scheduleResolver.resolveSubject(requestedText);
  }

  /**
   * Consulta el estado de la grabación en curso
   */
  async getRecordingStatus() {
    try {
      const stdout = execSync(`"${PYTHON_BIN}" "${TRANSCRIBER_SCRIPT}" json-status`, { encoding: 'utf-8' });
      const state = JSON.parse(stdout.trim());
      if (!state.is_recording) {
        return { isRecording: false, message: '⏹ No hay ninguna grabación de clase activa en este momento.' };
      }

      const startTime = new Date(state.start_time);
      const diffMins = Math.round((Date.now() - startTime.getTime()) / 60000);

      // Leer las últimas líneas del archivo
      let lastLines = [];
      if (state.session_file && fs.existsSync(state.session_file)) {
        const content = fs.readFileSync(state.session_file, 'utf-8');
        const lines = content.split('\n').filter(l => l.startsWith('[') && l.length > 15);
        lastLines = lines.slice(-2);
      }

      return {
        isRecording: true,
        materia: state.materia,
        sessionFile: state.session_file,
        elapsedMins: diffMins,
        chunksProcessed: state.chunks_processed || 0,
        entriesCount: state.entries_count || 0,
        lastLines
      };
    } catch (err) {
      return { isRecording: false, error: err.message };
    }
  }

  /**
   * Inicia la grabación continua de una clase
   */
  async startRecording(requestedSubject = '') {
    const subjectInfo = this.resolveSubject(requestedSubject);
    const materiaName = subjectInfo ? subjectInfo.name : (requestedSubject.trim() || 'Clase CUCEA');

    try {
      // Verificar si ya está grabando
      const currentStatus = await this.getRecordingStatus();
      if (currentStatus.isRecording) {
        return {
          success: false,
          alreadyRecording: true,
          materia: currentStatus.materia,
          elapsedMins: currentStatus.elapsedMins,
          message: `⚠️ Ya hay una clase grabándose (*${currentStatus.materia}*, lleva ${currentStatus.elapsedMins} mins).\nDime *"termina la clase"* para cerrarla antes de iniciar otra.`
        };
      }

      // Lanzar el script en modo CLI start
      execSync(`"${PYTHON_BIN}" "${TRANSCRIBER_SCRIPT}" start "${materiaName}"`, { encoding: 'utf-8' });

      let extraDetails = '';
      if (subjectInfo) {
        extraDetails = ` (Aula ${subjectInfo.aula || 'CUCEA'}${subjectInfo.prof ? ` con ${subjectInfo.prof}` : ''})`;
      }

      return {
        success: true,
        materia: materiaName,
        subjectInfo,
        message: `Listo Angel, ya puse a grabar *${materiaName}* en la Mac${extraDetails}.\n\nCuando acabe la clase solo dime *"termina la clase"* o *"guarda los apuntes"* y te armo el resumen en Notion :3`
      };
    } catch (err) {
      console.error('[CLASS NOTES] Error al iniciar grabación:', err.message);
      return {
        success: false,
        error: err.message,
        message: `❌ Error iniciando la grabación de clase: ${err.message}`
      };
    }
  }

  /**
   * Detiene la grabación actual y recupera el transcript
   */
  async stopRecording() {
    try {
      const stdout = execSync(`"${PYTHON_BIN}" "${TRANSCRIBER_SCRIPT}" stop`, { encoding: 'utf-8' });
      // Consultar json-status para conocer el session_file y la materia
      const statusOut = execSync(`"${PYTHON_BIN}" "${TRANSCRIBER_SCRIPT}" json-status`, { encoding: 'utf-8' });
      const state = JSON.parse(statusOut.trim());
      const sessionFile = state.session_file;
      const materia = state.materia || 'Clase CUCEA';

      let transcript = '';
      if (sessionFile && fs.existsSync(sessionFile)) {
        transcript = fs.readFileSync(sessionFile, 'utf-8');
      }

      return {
        success: true,
        materia,
        sessionFile,
        transcript,
        entriesCount: state.entries_count || 0
      };
    } catch (err) {
      console.error('[CLASS NOTES] Error deteniendo grabación:', err.message);
      return { success: false, error: err.message };
    }
  }

  _fallbackSynthesis(materiaName, cleanText) {
    return {
      resumen: `Sesión de ${materiaName}. Se discutieron conceptos prácticos y teóricos del curso según lo capturado en la sesión grabada.`,
      temas: [`Revisión de ${materiaName}`],
      conceptos: [{ concepto: 'Temario del curso', definicion: 'Conceptos y metodologías abordadas en la clase.' }],
      tareas: [],
      puntosProfesor: ['Repasar el material y las notas de la sesión.'],
      preguntasEstudio: ['¿Cuáles fueron los temas centrales abordados en esta clase?']
    };
  }

  /**
   * Sintetiza el transcript en apuntes universitarios estructurados vía agy CLI
   */
  synthesizeNotes(materiaName, rawTranscript) {
    return new Promise((resolve) => {
      console.log(`🧠 [CLASS NOTES] Sintetizando apuntes pedagógicos para ${materiaName}...`);

      // Limpieza preliminar del transcript
      const cleanLines = rawTranscript.split('\n')
        .filter(l => !l.startsWith('#') && !l.startsWith('Materia:') && !l.startsWith('Fecha:') && !l.startsWith('Inicio:') && !l.startsWith('Modelo:') && !l.startsWith('───') && l.trim().length > 0)
        .slice(0, 150); // Límite de contexto balanceado

      const cleanText = cleanLines.join('\n');

      if (!cleanText || cleanText.length < 50) {
        return resolve({
          resumen: `Sesión de ${materiaName}. La grabación contiene poco audio o no se registraron intervenciones suficientes.`,
          temas: ['Revisión general de la clase'],
          conceptos: [{ concepto: 'Introducción', definicion: 'Conceptos preliminares del tema de clase.' }],
          tareas: [],
          puntosProfesor: ['Prestar atención a los anuncios en la próxima sesión.'],
          preguntasEstudio: ['¿Cuáles fueron los temas iniciales abordados?']
        });
      }

      const prompt = `Eres un asistente universitario de excelencia académica para un estudiante de Tecnologías de la Información en CUCEA (UdeG).
Analiza la siguiente transcripción en tiempo real de una clase de "${materiaName}".

Debes generar un resumen estructurado, analítico, útil para estudiar y riguroso.
DIRECTIVAS HUMANIZER (CERO CLICHÉS DE IA):
- Escribe en prosa académica directa, clara y funcional para un estudiante de ingeniería.
- CERO frases cliché: "esta sesión sirvió como testimonio", "un fascinante viaje a través de", "es crucial entender", "un tapiz de conocimientos", "en el vertiginoso mundo".
- CERO gerundios de posterioridad ("abordó la arquitectura, permitiendo escalar..." -> "abordó la arquitectura y explicó cómo escalar...").
- CERO invención: Limítate estrictamente a lo que el profesor y los alumnos discutieron en el audio. Si algo no se dijo, no lo rellenes.
Devuelve EXCLUSIVAMENTE un objeto JSON válido con este esquema exacto (sin texto adicional fuera del JSON):

{
  "resumen": "Resumen ejecutivo de 1 o 2 párrafos concisos, con ritmo variado y lenguaje directo, explicando de qué trató la clase y qué problemas técnicos se resolvieron.",
  "temas": ["Tema 1", "Tema 2", "Tema 3"],
  "conceptos": [
    { "concepto": "Nombre del término técnico", "definicion": "Explicación práctica, nítida y rigurosa explicada por el profesor" }
  ],
  "tareas": [
    { "titulo": "Descripción clara de la entrega o práctica", "fechaLimite": "YYYY-MM-DD o null si no se dijo fecha", "prioridad": "Alta" }
  ],
  "puntosProfesor": [
    "Énfasis o advertencia clave que el profesor recalcó (ej. 'esto viene en el examen')"
  ],
  "preguntasEstudio": [
    "Pregunta de autoevaluación 1 para repasar",
    "Pregunta de autoevaluación 2"
  ]
}

Transcripción de la clase:
${cleanText}
`;

      execFile(AGY_BIN, ['-p', prompt, '--output-format', 'json', '--dangerously-skip-permissions'], {
        timeout: 90000,
        maxBuffer: 10 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: `/Users/angelzaragoza/.local/bin:/Users/angelzaragoza/.nvm/versions/node/v24.11.1/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`
        }
      }, (error, stdout, stderr) => {
        if (error) {
          console.warn('[CLASS NOTES] Fallback de síntesis local (error agy):', error.message);
          return resolve(this._fallbackSynthesis(materiaName, cleanText));
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          let responseText = parsed.response || stdout.trim();

          const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, responseText];
          const resultJson = JSON.parse(jsonMatch[1].trim());
          resolve(resultJson);
        } catch (e) {
          console.warn('[CLASS NOTES] Fallback por JSON parse error:', e.message);
          resolve(this._fallbackSynthesis(materiaName, cleanText));
        }
      });
    });
  }

  /**
   * Convierte la síntesis en bloques nativos de Notion
   */
  buildNotionBlocks(materiaName, synthesis, transcriptPath) {
    return notionNotesBuilder.buildBlocks(materiaName, synthesis, transcriptPath);
  }

  /**
   * Guarda la nota completa en Notion (DB Notas + Inserción en página de Materia + Tareas)
   */
  async saveToNotion({ materiaName, materiaId, synthesis, sessionFile }) {
    console.log(`📥 [NOTION] Guardando apunte de ${materiaName} en Notion...`);
    const now = new Date();
    const dateFormatted = now.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Mexico_City'
    });

    const noteTitle = `${materiaName} @${dateFormatted}`;
    const blocks = this.buildNotionBlocks(materiaName, synthesis, sessionFile);

    // 1. Crear página en la Base de Datos 'Notas'
    const pageProperties = {
      'Título': { title: [{ text: { content: noteTitle } }] },
      'Tipo': { select: { name: 'Clase' } },
      '🏢 Life pilars': { relation: [{ id: LIFE_PILLARS.UNIVERSIDAD.id }] }
    };

    if (materiaId) {
      pageProperties['Materia'] = { relation: [{ id: materiaId }] };
    }

    if (synthesis.resumen) {
      pageProperties['Resumen'] = { rich_text: [{ text: { content: synthesis.resumen.slice(0, 300) } }] };
    }

    // Notion permite hasta 100 bloques en la creación
    const initialBlocks = blocks.slice(0, 95);
    const createdPage = await notionRequest('/pages', 'POST', {
      parent: { database_id: DATABASES.NOTAS },
      properties: pageProperties,
      children: initialBlocks
    });

    const notePageId = createdPage.id;
    const noteUrl = createdPage.url || `https://notion.so/${notePageId.replace(/-/g, '')}`;

    // Si había más de 95 bloques, agregar el resto
    if (blocks.length > 95) {
      const remaining = blocks.slice(95);
      await notionRequest(`/blocks/${notePageId}/children`, 'PATCH', {
        children: remaining
      });
    }

    console.log(`✅ [NOTION] Nota creada en DB Notas: ${noteUrl}`);

    // 2. Inserción directa dentro de la página de la Materia (Doble Vinculación)
    if (materiaId) {
      try {
        console.log(`📎 [NOTION] Insertando bloque de referencia en página de la Materia ${materiaId}...`);
        await notionRequest(`/blocks/${materiaId}/children`, 'PATCH', {
          children: [
            {
              object: 'block',
              type: 'callout',
              callout: {
                icon: { type: 'emoji', emoji: '📚' },
                rich_text: [
                  { type: 'text', text: { content: `Apunte de Clase (${dateFormatted}): ` }, annotations: { bold: true } },
                  { type: 'text', text: { content: `${synthesis.resumen ? synthesis.resumen.slice(0, 160) + '... ' : ''}` } },
                  { type: 'text', text: { content: '👉 Ver Nota Completa', link: { url: noteUrl } }, annotations: { bold: true, underline: true } }
                ]
              }
            }
          ]
        });
        console.log(`✅ [NOTION] Referencia insertada en la página de la Materia.`);
      } catch (matErr) {
        console.warn(`[NOTION] No se pudo insertar en la página de Materia: ${matErr.message}`);
      }
    }

    // 3. Crear tareas detectadas en Notion DB 'Tareas'
    const tareasCreadas = [];
    if (synthesis.tareas && synthesis.tareas.length > 0) {
      for (const t of synthesis.tareas) {
        try {
          const taskTitle = `[${materiaName}] ${t.titulo}`;
          const taskProps = {
            'Tarea': { title: [{ text: { content: taskTitle } }] },
            'Estado': { status: { name: 'No iniciado' } },
            'Prioridad': { status: { name: 'Alta' } },
            'Life pilars': { relation: [{ id: LIFE_PILLARS.UNIVERSIDAD.id }] }
          };

          if (t.fechaLimite && /^\d{4}-\d{2}-\d{2}/.test(t.fechaLimite)) {
            taskProps['Fecha limite'] = { date: { start: t.fechaLimite } };
          }

          if (materiaId) {
            taskProps['Materia'] = { relation: [{ id: materiaId }] };
          }

          const createdTask = await notionRequest('/pages', 'POST', {
            parent: { database_id: DATABASES.TAREAS },
            properties: taskProps
          });
          tareasCreadas.push({ title: taskTitle, id: createdTask.id, dueDate: t.fechaLimite });
          console.log(`✅ [NOTION] Tarea escolar agendada: ${taskTitle}`);
        } catch (tErr) {
          console.error(`[NOTION] Error creando tarea escolar:`, tErr.message);
        }
      }
    }

    return {
      notePageId,
      noteUrl,
      noteTitle,
      tareasCreadas
    };
  }

  /**
   * Ciclo completo de finalización: detiene grabación, sintetiza y guarda en Notion
   */
  async stopAndGenerateNotes() {
    console.log('⏹ [CLASS NOTES] Finalizando clase y generando apuntes...');
    const stopResult = await this.stopRecording();
    if (!stopResult.success) {
      return {
        success: false,
        message: `⚠️ No se pudo detener la clase: ${stopResult.error || 'Sin sesión activa'}`
      };
    }

    const { materia: rawMateria, sessionFile, transcript } = stopResult;
    const subjectInfo = this.resolveSubject(rawMateria);
    const materiaName = subjectInfo ? subjectInfo.name : rawMateria;
    const materiaId = subjectInfo ? subjectInfo.id : null;

    // 1. Sintetizar apuntes con IA
    const synthesis = await this.synthesizeNotes(materiaName, transcript || '');

    // 2. Guardar en Notion
    const notionResult = await this.saveToNotion({
      materiaName,
      materiaId,
      synthesis,
      sessionFile
    });

    // 3. Formatear mensaje para WhatsApp y CLI
    let msg = `Ya quedaron listos los apuntes de *${materiaName}* en Notion :3\n\n`;

    if (synthesis.resumen) {
      msg += `*De qué trató la sesión:*\n${synthesis.resumen}\n\n`;
    }

    if (synthesis.temas && synthesis.temas.length > 0) {
      msg += `*Temas clave:*\n`;
      for (const t of synthesis.temas.slice(0, 4)) {
        msg += `• ${t}\n`;
      }
      msg += `\n`;
    }

    if (notionResult.tareasCreadas && notionResult.tareasCreadas.length > 0) {
      msg += `*Tareas que detecté para Notion:*\n`;
      for (const tc of notionResult.tareasCreadas) {
        msg += `• *${tc.title}*${tc.dueDate ? ` _(vence: ${tc.dueDate})_` : ''}\n`;
      }
      msg += `\n`;
    }

    if (notionResult.noteUrl) {
      msg += `Te dejé la nota completa aquí: ${notionResult.noteUrl}`;
    }

    return {
      success: true,
      materia: materiaName,
      noteUrl: notionResult.noteUrl,
      tareasCount: notionResult.tareasCreadas.length,
      message: msg
    };
  }
}

module.exports = new ClassNotesManager();
