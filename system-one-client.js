const http = require('http');

const SYSTEM_ONE_URL = 'http://127.0.0.1:8766/v1/systemone';

/**
 * Consulta al motor local de Sistema 1 (Laya-MLX en GPU Metal)
 * Responde en ~15-30 milisegundos con costo $0.
 *
 * @param {string} state - El texto del mensaje recibido
 * @param {object} questions - Definición tipada de preguntas (choice, noul, score)
 * @returns {Promise<object|null>}
 */
function askSystemOne(state, questions) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({ state, questions });
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8766,
      path: '/v1/systemone',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 7000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

/**
 * Clasificador rápido de avisos escolares (CUCEA WhatsApp y Classroom)
 * Retorna { tipo: '🚨 No hay clase' | '💻 Clase virtual / Asíncrona' | '⚠️ Cambio de aula / horario' | null, choice, confidence }
 */
async function classifySchoolNotice(text) {
  const questions = {
    aviso: {
      type: 'choice',
      instructions: '¿Este mensaje sobre una clase universitaria anuncia cancelación/falta, sesión virtual o cambio de salón?',
      criteria: {
        no_hay_clase: 'No hay clase, suspensión, cancelación o el profesor no asistirá o no se presenten',
        clase_virtual: 'La clase será virtual, en línea por Meet/Zoom o sincrónica/asincrónica desde casa',
        cambio_aula: 'Cambio de salón, aula o laboratorio',
        otro: 'No anuncia cancelación ni cambio de aula; es conversación casual, duda, entrega o saludo'
      }
    }
  };

  const res = await askSystemOne(text, questions);
  if (!res || !res.answers || !res.answers.aviso) return null;

  const choice = res.answers.aviso.choice;
  const prob = res.answers.aviso.probabilities?.[choice] || res.answers.aviso.confidence || 0;

  if (choice === 'no_hay_clase' && prob > 0.5) {
    return { tipo: '🚨 No hay clase', confidence: prob };
  }
  if (choice === 'clase_virtual' && prob > 0.5) {
    return { tipo: '💻 Clase virtual / Asíncrona', confidence: prob };
  }
  if (choice === 'cambio_aula' && prob > 0.5) {
    return { tipo: '⚠️ Cambio de aula / horario', confidence: prob };
  }

  return { tipo: null, choice, confidence: prob };
}

/**
 * Gatekeeper para llamadas a Antigravity (agy) mediante Laya-MLX
 * Determina semánticamente si un mensaje es trivial (reacción pura, agradecimiento, risas) o requiere el LLM completo.
 */
async function isTrivialMessage(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return true;

  // Comandos de bot o terminal jamás son triviales
  if (/^[!/]/.test(trimmed)) {
    return false;
  }

  // Si tiene más de 25 caracteres o más de 4 palabras, NO es trivial
  if (trimmed.length > 25 || trimmed.split(/\s+/).length > 4) {
    return false;
  }

  // Si tiene signos de interrogación, no es trivial
  if (trimmed.includes('?') || trimmed.includes('¿')) {
    return false;
  }

  // Si contiene verbos de acción, órdenes o sustantivos clave, no es trivial
  if (/\b(?:qu[eé]|c[oó]mo|cu[aá]ndo|d[oó]nde|qui[eé]n|por\s*qu[eé]|cu[aá]l|dime|dame|explica|oye|mira|revisa|checa|busca|contacto|primo|mensaje|empiez[ao]?|inici[ao]?|graba|termin[ao]?|par[ao]?|apag[ao]?|haz|crea|pon|recu[eé]rda|sube|come|trae|ve|di|status|bateria|battery|ping|lock|screen|ayuda|prueba|envia|envía|manda)\b/i.test(trimmed)) {
    return false;
  }

  // Patrones directos de confirmaciones cortas / agradecimientos / risas / emojis
  const TRIVIAL_EXACT = /^(?:(?:ok|va|sim[oó]n|gracias|muchas\s+gracias|mil\s+gracias|grax|ty|thx|(?:ja|je|ha|he)+a*|xd+|:3|sale|chido|[oó]rale|arre|de\s+nada|perfecto|entendido|enterado|listo|👍|👌|❤️|🙏)\s*)+$/i;
  if (TRIVIAL_EXACT.test(trimmed)) {
    return true;
  }

  try {
    const questions = {
      tipo_mensaje: {
        type: 'choice',
        instructions: '¿Este mensaje es solo una reacción breve/agradecimiento o una consulta sustantiva?',
        criteria: {
          trivial: 'Agradecimiento (gracias, arigato), risas (jaja, xd), emojis o confirmación breve (ok, va, simón, de nada)',
          sustantivo: 'Es una pregunta, consulta de datos, orden o tema con contenido para responder'
        }
      }
    };
    const res = await askSystemOne(trimmed, questions);
    const choice = res?.answers?.tipo_mensaje?.choice;
    const confidence = res?.answers?.tipo_mensaje?.confidence || res?.answers?.tipo_mensaje?.probabilities?.trivial || 0;
    return choice === 'trivial' && confidence >= 0.70;
  } catch (err) {
    console.error('[GATEKEEPER] Error en Laya-MLX isTrivialMessage:', err.message);
  }

  return false;
}

/**
 * Clasificador semántico de intenciones clave del asistente
 * Sustituye regex rígidas para: corte de gastos, briefing matutino, auditoría Notion y control de clases
 */
async function classifyUserIntent(text) {
  if (!text) return 'otra';
  const clean = text.trim();

  // Guardias negativas explícitas: frases que niegan clases o grabaciones
  if (/(?:no\s+estamos\s+en\s+(?:ninguna\s+)?clase|no\s+es\s+clase|no\s+estoy\s+en\s+clase)/i.test(clean)) {
    return 'otra';
  }

  // Pre-filtro por palabras candidatas: Si el texto no contiene léxico de alguna intención especial, retornar 'otra' en 0ms
  const hasFinance = /(?:corte|gastos?|finanzas?|balance|cuanto\s+he\s+gastado|reporte\s+financiero|resumen\s+de\s+gastos)/i.test(clean);
  const hasBriefing = /(?:briefing|daily|agenda|resumen\s+(?:del?\s+d[ií]a|de\s+hoy)|qu[eé]\s+tengo\s+hoy|dame\s+mi\s+d[ií]a|buenos\s+d[ií]as\s*,?\s*(?:dame|pasame|pásame|manda|mándame|cuál|cual|qué|que))/i.test(clean);
  const hasAudit = /(?:auditor[ií]a|auditar|salud\s+(?:del?\s+)?second\s+brain|revisar\s+notion|regenerar\s+grafo)/i.test(clean);
  const hasClass = /(?:clase|graba(?:r|ndo|ci[oó]n)?|apuntes?\s+de\s+clase|whisper)/i.test(clean);

  if (!hasFinance && !hasBriefing && !hasAudit && !hasClass) {
    return 'otra';
  }

  // Si tiene léxico de clase, resolver la acción de forma exacta
  if (hasClass && !hasFinance && !hasBriefing && !hasAudit) {
    if (/(?:empiez|empez|inici|comienz|comenz)\b/i.test(clean)) return 'clase_start';
    if (/(?:c[oó]mo\s+va|estado|status|tiempo|cu[aá]nto\s+llevamos)\b/i.test(clean)) return 'clase_status';
    if (/(?:termin|finaliz|deten|par[ao]?|apag[ao]?)\b/i.test(clean)) return 'clase_stop';
    return 'otra';
  }

  if (hasBriefing && !hasFinance && !hasAudit && !hasClass) {
    return 'daily_briefing';
  }

  if (hasFinance && !hasBriefing && !hasAudit && !hasClass) {
    return 'corte_gastos';
  }

  if (hasAudit && !hasFinance && !hasBriefing && !hasClass) {
    return 'auditoria_notion';
  }

  return 'otra';
}

/**
/**
 * Clasificador de mención e invocación del bot Antigravity.
/**
 * Clasificador de mención e invocación del bot Antigravity.
 * Detecta comandos explícitos (!ai, !ia, antigravity) y consultas semánticas dirigidas a la IA con Laya-MLX.
 */
async function classifyBotMention(text) {
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  if (
    lower.includes('!ai') ||
    lower.includes('/ai') ||
    lower.includes('!ia') ||
    lower.includes('/ia') ||
    lower.includes('antigravity') ||
    lower.includes('antogravity') ||
    lower.includes('@antigravity') ||
    lower.includes('jarvis') ||
    lower.includes('!jarvis') ||
    lower.includes('/jarvis') ||
    lower.includes('@jarvis') ||
    lower.includes('gemini') ||
    lower.includes('!gemini') ||
    lower.includes('/gemini') ||
    lower.includes('@gemini')
  ) {
    return true;
  }

  // Si no contiene palabras alusivas a un bot o IA como palabras completas, no invocar
  if (!/\b(?:bot|asistente|ia|ai)\b/i.test(lower)) {
    return false;
  }

  try {
    const questions = {
      dirigido_a_ia: {
        type: 'choice',
        instructions: '¿El usuario le está pidiendo algo directamente a un asistente de inteligencia artificial o chatbot?',
        criteria: {
          si: 'Le pide algo directamente al bot o asistente (ej: dime, explícame, genera, programa, ayúdame)',
          no: 'Es un mensaje entre humanos que no pide asistencia de un bot'
        }
      }
    };
    const res = await askSystemOne(text, questions);
    return res?.answers?.dirigido_a_ia?.choice === 'si';
  } catch {
    return false;
  }
}

async function classifyClosingMessage(text) {
  if (!text) return false;
  const trimmed = text.trim().toLowerCase();
  if (trimmed.length > 80 || trimmed.includes('?') || trimmed.includes('¿')) {
    return false;
  }

  const clean = trimmed.replace(/@?antigravity/gi, '').replace(/[!¡.,]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Expresiones deterministas de descanso / sueño
  const hasBedtime = /(?:me\s+voy\s+a\s+(?:mimir|dormir|descansar|acostar)|(?:ya\s+)?(?:a\s+mimir|a\s+dormir|a\s+descansar)|hasta\s+mañana|buenas\s+noches|que\s+descanses|que\s+duermas\s+bien)\b/i.test(clean);
  if (hasBedtime) return true;

  // 2. Despedidas y agradecimientos puros (1-4 palabras)
  const PURE_FAREWELL = /^(?:muchas\s+gracias|mil\s+gracias|gracias|adi[oó]s|bye|chao|hasta\s+luego|nos\s+vemos|sale\s+bye|va\s+bye|descansa)(?:\s+(?:bro|amigo|amiga|equipo|todos|crack|carnal))?$/i;
  if (PURE_FAREWELL.test(clean)) return true;

  // 3. Agradecimiento + despedida combinados
  if (/(?:gracias|agradezco)/i.test(clean) && /(?:bye|adi[oó]s|chao|nos\s+vemos|hasta\s+luego)/i.test(clean)) {
    return true;
  }

  const CLOSING_INDICATORS = [
    'adiós', 'adios', 'bye', 'chao', 'hasta luego', 'nos vemos', 'gracias',
    'muchas gracias', 'mil gracias', 'sale bye', 'va bye', 'buenas noches',
    'hasta mañana', 'descansa', 'mimir', 'a mimir', 'a dormir', 'me voy a mimir', 'me voy a dormir'
  ];
  const hasClosingWord = CLOSING_INDICATORS.some(w => clean === w || clean.startsWith(w + ' ') || clean.endsWith(' ' + w) || clean.includes(' ' + w + ' '));
  if (!hasClosingWord) {
    return false;
  }

  const questions = {
    closing: {
      type: 'choice',
      instructions: '¿El mensaje indica el cierre o despedida de la conversación (adiós, bye, gracias, hasta luego, nos vemos, me voy a dormir/mimir, buenas noches, etc.)?',
      criteria: {
        yes: 'Sí, es una despedida, cierre o se va a dormir',
        no: 'No es un mensaje de cierre; es una pregunta, orden o consulta'
      }
    }
  };
  const res = await askSystemOne(clean, questions);
  if (!res || !res.answers || !res.answers.closing) return true; // Si falló Laya pero tiene palabra de cierre, aceptar
  return res.answers.closing.choice === 'yes';
}

/**
 * Clasificador semántico de accionabilidad de tareas (Actionability Gate)
 * Discrimina obligaciones reales (estudio, trabajo, trámites, pagos)
 * de actividades cotidianas, descanso, ocio o charla casual.
 *
 * @param {string} text
 * @returns {Promise<{ isActionable: boolean, choice: string, confidence: number }>}
 */
async function classifyTaskActionability(text) {
  if (!text) return { isActionable: false, choice: 'rutina_o_descanso', confidence: 1 };
  const trimmed = text.trim();

  // Si tiene formato sintáctico explícito de tarea, es 100% accionable sin consultar Laya
  if (/^(?:tarea:?|pendiente:?|to-do:?|por\s+hacer:?)\s+/i.test(trimmed) || /^-\s*\[\s*\]\s+/i.test(trimmed)) {
    return { isActionable: true, choice: 'obligacion', confidence: 1.0 };
  }

  // Guardias deterministas: ubicación actual, presencia, estado personal o reacciones casuales NO son tareas
  if (/^(?:si\s+)?(?:ya\s+)?(?:estoy|ando|estamos|llegu[eé]|llegamos|vengo|voy\s+llegando|voy\s+en\s+camino|en\s+camino|aqu[ií]\s+ando|aqu[ií]\s+estoy|cerca\s+estoy|lejos\s+estoy|estoy\s+en|ando\s+en|ya\s+sal[ií]|ya\s+entr[eé]|aqu[ií]\s+en|ora\b|orale\b|ah\b|sim[oó]n\b|pero\s+pues|pues\s+cerca)\b/i.test(trimmed)) {
    return { isActionable: false, choice: 'rutina_o_descanso', confidence: 0.99 };
  }

  const questions = {
    intencion: {
      type: 'choice',
      instructions: '¿Este texto expresa una obligación, pendiente, trámite o deber (estudio, trabajo, pago, entrega), o es una acción cotidiana, descanso, sueño o entretenimiento (dormir, descansar, comer, jugar, platicar)?',
      criteria: {
        obligacion: 'Obligación, tarea escolar o laboral, pendiente, pago, trámite o encargo formal',
        rutina_o_descanso: 'Dormir, mimir, descansar, ocio, entretenimiento, comida casual o saludo'
      }
    }
  };

  try {
    const res = await askSystemOne(trimmed, questions);
    const choice = res?.answers?.intencion?.choice;
    const prob = res?.answers?.intencion?.probabilities?.[choice] || res?.answers?.intencion?.confidence || 0;

    return {
      isActionable: choice === 'obligacion',
      choice: choice || 'rutina_o_descanso',
      confidence: prob
    };
  } catch {
    return { isActionable: false, choice: 'rutina_o_descanso', confidence: 0.5 };
  }
}

async function classifySearchCommand(text) {
  if (!text) return null;
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('!buscar') || lower.startsWith('/buscar')) {
    const term = trimmed.replace(/^[!/]buscar\s*/i, '').trim();
    return term || null;
  }
  const aiSearchMatch = trimmed.match(/^(?:[!/](?:ia|ai|jarvis|gemini)|@?(?:antigravity|jarvis|gemini))\s+(?:busca|buscar|encuentra)\s+(.+)$/i);
  if (aiSearchMatch) {
    return aiSearchMatch[1].trim() || null;
  }
  return null;
}

/**
 * Clasificador semántico de categorías de gasto para comprobantes o transacciones
 */
async function classifyExpenseCategory(text) {
  const questions = {
    categoria: {
      type: 'choice',
      instructions: '¿En qué categoría de gasto financiero encaja este concepto?',
      criteria: {
        salidas: 'Comida fuera, restaurantes, tacos, café, cine, citas, salidas',
        suscripciones: 'Streaming, servicios digitales recurrentes como Netflix, Spotify, software',
        servicios_hogar: 'Luz CFE, agua Siapa, gas, despensa o supermercado para la casa',
        internet_celular: 'Telefonía móvil, recargas, planes Telcel/AT&T, internet fijo',
        renta: 'Renta o depósito de vivienda',
        otro: 'Otro gasto general'
      }
    }
  };

  const res = await askSystemOne(text, questions);
  if (!res || !res.answers || !res.answers.categoria) return null;
  return res.answers.categoria.choice || null;
}

/**
 * Clasificador semántico de complejidad del mensaje.
 * Decide qué nivel de razonamiento requiere el mensaje para elegir el modelo óptimo.
 *
 * Niveles:
 *  trivial → saludo, emoji, ack corto          → gemini-3.8-flash-low
 *  simple  → pregunta directa, chat casual     → gemini-3.8-flash-medium
 *  complex → código, Notion, análisis, RAG     → gemini-3.8-flash-high
 *  expert  → deep reasoning, multi-step pesado → gemini-3.1-pro-low
 */
async function classifyMessageComplexity(text) {
  if (!text) return 'simple';
  const trimmed = text.trim();
  if (trimmed.length <= 6) return 'trivial';
  if (await isTrivialMessage(trimmed)) return 'trivial';

  const questions = {
    complejidad: {
      type: 'choice',
      instructions: '¿Qué nivel de razonamiento requiere este mensaje para responderlo correctamente?',
      criteria: {
        trivial: 'Saludo simple, emoji, confirmación corta, "ok", "gracias", "sí", "no" o mensaje sin contenido sustancial',
        simple: 'Pregunta directa sobre un tema concreto, conversación casual, resumen breve, consulta de datos simples',
        complex: 'Requiere programar código, analizar datos, buscar en historial (RAG), registrar en Notion, múltiples pasos lógicos, análisis técnico',
        expert: 'Razonamiento profundo multi-paso, investigación científica, planificación estratégica compleja, depuración de sistemas críticos o decisiones de alta consecuencia'
      }
    }
  };

  const res = await askSystemOne(text, questions);
  if (!res || !res.answers || !res.answers.complejidad) return 'simple'; // fallback seguro
  return res.answers.complejidad.choice || 'simple';
}

/**
 * Elige el modelo agy óptimo basado en la complejidad clasificada por Laya-MLX.
 * Fallback a gemini-3.8-flash-medium si Laya no responde.
 *
 * @param {string} text - Mensaje del usuario
 * @returns {Promise<string>} - Identificador de modelo para el flag --model de agy
 */
async function pickModel(text) {
  const MODEL_MAP = {
    trivial: 'gemini-3.8-flash-low',
    simple:  'gemini-3.8-flash-medium',
    complex: 'gemini-3.8-flash-high',
    expert:  'gemini-3.1-pro-low'
  };

  try {
    const complexity = await classifyMessageComplexity(text);
    const model = MODEL_MAP[complexity] || MODEL_MAP.simple;
    console.log(`🧠 [LAYA → MODEL] complejidad="${complexity}" → ${model}`);
    return model;
  } catch (err) {
    console.error('[LAYA → MODEL] Error al clasificar complejidad, usando fallback:', err.message);
    return MODEL_MAP.simple;
  }
}


/**
 * Clasificador semántico de Pilares de Vida (Notion Life Pillars)
 */
async function classifyLifePilar(text) {
  const questions = {
    pilar: {
      type: 'choice',
      instructions: '¿A qué área o pilar de vida de Angel pertenece esta tarea o actividad?',
      criteria: {
        universidad: 'Clases, tareas de CUCEA, exámenes, profesores, materias, universidad',
        trabajo: 'Trabajo, clientes, agencias, tickets de soporte',
        profesional: 'Proyectos de código, portafolio web, Shopify, desarrollo de software, Kessoku Dev',
        finanzas: 'Dinero, pagos, transferencias, bancos, tarjetas, ahorros, presupuestos',
        hobbies: 'Crochet, amigurumis, videojuegos, cosplay, anime, atletismo, running 10k',
        vida_personal: 'Pareja (Erika), salidas personales, compras de casa, citas'
      }
    }
  };

  const res = await askSystemOne(text, questions);
  if (!res || !res.answers || !res.answers.pilar) return null;
  return res.answers.pilar.choice || null;
}

/**
 * Clasificador semántico para detectar si un mensaje pregunta por conversaciones o hechos del pasado
 * Sustituye regex rígidas de RAG en session-manager.js
 */
async function isChatHistoryQuestion(text) {
  const questions = {
    tipo_consulta: {
      type: 'choice',
      instructions: '¿Qué tipo de consulta es esta?',
      criteria: {
        historial: 'Pregunta qué dijo alguien antes o consultar información de mensajes pasados',
        general: 'Instrucción actual, saludo o conversación general'
      }
    }
  };

  const res = await askSystemOne(text, questions);
  if (!res || !res.answers || !res.answers.tipo_consulta) return false;
  return res.answers.tipo_consulta.choice === 'historial';
}

/**
 * Clasificador semántico de intención de Stickers
 * Decide qué sticker enviar según la emoción o contexto con Laya-MLX
 */
async function classifyStickerIntent(text) {
  const clean = (text || '').trim();
  if (!clean) return null;

  // Pre-filtro léxico estricto: Si el texto no menciona palabras clave de stickers, retornar null en 0ms
  const hasChapaLexicon = /\b(?:chapa|perre[ao]|bail[ea]|fiesta|desmadre|menea|meneando)\b/i.test(clean);
  const hasExitoLexicon = /\b(?:chamba|trabaj[ao]|[eé]xito|darle|vamos\s+con\s+todo|a\s+darle|motivaci[oó]n|[aá]nimo)\b/i.test(clean);

  if (!hasChapaLexicon && !hasExitoLexicon) {
    return null;
  }

  const questions = {
    sticker: {
      type: 'choice',
      instructions: '¿El usuario pide o amerita enviar un sticker divertido, de fiesta/baile o de motivación/éxito?',
      criteria: {
        chapa: 'Pide o habla de menear la chapa, perreo, fiesta, baile, chapa o desmadre',
        exito: 'Habla de chamba, trabajo, éxito, darle con todo, esfuerzo laboral o estudio',
        ninguno: 'Conversación normal, no requiere sticker'
      }
    }
  };

  const res = await askSystemOne(clean, questions);
  if (!res || !res.answers || !res.answers.sticker) return null;
  const choice = res.answers.sticker.choice;
  const prob = res.answers.sticker.probabilities?.[choice] || res.answers.sticker.confidence || 0;

  if (choice === 'chapa' && hasChapaLexicon && prob >= 0.50) return choice;
  if (choice === 'exito' && hasExitoLexicon && prob >= 0.50) return choice;
  return null;
}

/**
 * Clasificador semántico de materias de CUCEA (semestre 2026B)
 * Sustituye regex rígidas de materias
 */
async function classifySubject(text) {
  const questions = {
    materia: {
      type: 'choice',
      instructions: '¿A cuál materia universitaria de la carrera de TI en CUCEA se refiere este texto?',
      criteria: {
        web: 'Programación Web (HTML, CSS, JavaScript, PHP, Fregoso)',
        bd: 'Sistemas de Bases de Datos II (MySQL, SQL, joins, DER, Martha)',
        redes: 'Fundamentos de Redes (Cisco, Packet Tracer, IP, subredes, Claustro)',
        bi: 'Inteligencia de Negocios (Data Warehouse, KPI, ETL, Guiza)',
        software: 'Ingeniería de Software (Scrum, UML, casos de uso, Durán)',
        admin_ti: 'Administración de TI (Gestión de proyectos, líder, Daniel Muñoz)',
        gestion_ti: 'Gestión de Servicios de TI II (ITIL, López Campos)',
        big_data: 'Big Data (Hadoop, Spark, Barbosa)',
        ninguna: 'Ninguna materia en particular'
      }
    }
  };

  const res = await askSystemOne(text, questions);
  if (!res || !res.answers || !res.answers.materia) return null;
  const choice = res.answers.materia.choice;
  if (choice === 'ninguna') return null;
  return choice;
}

/**
 * Detector rápido de vocativo o alusión directa a otro interlocutor humano.
 * Evita intervenir cuando dos personas están platicando entre sí.
 *
 * @param {string} text - El texto del mensaje
 * @param {string[]} knownParticipants - Lista opcional de nombres conocidos
 * @returns {boolean}
 */
function detectHumanAddressee(text, knownParticipants = ['angel', 'pipo', 'erika']) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.trim();
  if (!clean) return false;

  const namesPattern = knownParticipants.join('|');

  // Patrón 1: Saludo/llamado directo ("oye Angel", "mira Pipo", "hola Erika")
  const vocativeRegex = new RegExp(`(?:oye|oigan|mira|hola|qué onda|que onda|bro|amigo)\\s+(?:${namesPattern})\\b`, 'i');
  if (vocativeRegex.test(clean)) return true;

  // Patrón 2: Nombre al inicio de la oración como vocativo ("Angel, a qué hora...")
  const startNameRegex = new RegExp(`^(?:${namesPattern})[,:]?\\s+`, 'i');
  if (startNameRegex.test(clean)) return true;

  // Patrón 3: "y tú Angel", "cómo ves Pipo"
  const questionToHumanRegex = new RegExp(`(?:y tú|y tu|cómo ves|como ves)\\s+(?:${namesPattern})\\b`, 'i');
  if (questionToHumanRegex.test(clean)) return true;

  // Patrón 4: Alusión de segunda persona con el nombre ("Angel qué opinas", "Pipo vamos")
  const directActionRegex = new RegExp(`\\b(?:${namesPattern})\\s+(?:qué|que|cómo|como|cuándo|cuando|a qué|a que|dime|vamos|viste|sabes)\\b`, 'i');
  if (directActionRegex.test(clean)) return true;

  return false;
}

/**
 * Clasificador Laya-MLX en GPU Metal para evaluar si se debe intervenir en LURK_MODE.
 * Aplica umbral asimétrico conservador (>= 0.85) para no interrumpir pláticas ajenas.
 *
 * @param {string} ambientContext - Contexto previo acumulado en buffer
 * @param {string} text - Mensaje reciente a evaluar
 * @returns {Promise<{ action: 'SILENT'|'CHIME_IN', confidence: number, reason?: string }>}
 */
async function classifyLurkIntervention(ambientContext, text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return { action: 'SILENT', confidence: 1.0 };

  // Si detecta vocativo explícito a otro humano, forzar silencio de inmediato
  if (detectHumanAddressee(trimmed)) {
    return { action: 'SILENT', confidence: 1.0, reason: 'vocativo_humano' };
  }

  const combinedState = ambientContext && ambientContext.trim()
    ? `Contexto previo del chat:\n${ambientContext.slice(-400)}\n\nMensaje reciente:\n"${trimmed}"`
    : `Mensaje reciente:\n"${trimmed}"`;

  const questions = {
    intervencion: {
      type: 'choice',
      instructions: '¿Este mensaje en un chat grupal o de amigos va dirigido al asistente de IA pidiendo su auxilio/opinión, o es simplemente una conversación entre humanos?',
      criteria: {
        habla_al_asistente: 'El usuario hace una pregunta directa a la IA, solicita su opinión experta o pide ayuda fáctica al asistente',
        platica_entre_humanos: 'Conversación casual entre personas, bromas entre amigos, planes entre ellos o comentarios cotidianos'
      }
    }
  };

  try {
    const res = await askSystemOne(combinedState, questions);
    if (res?.answers?.intervencion) {
      const choice = res.answers.intervencion.choice;
      const prob = res.answers.intervencion.probabilities?.[choice] || res.answers.intervencion.confidence || 0;
      if (choice === 'habla_al_asistente' && prob >= 0.85) {
        return { action: 'CHIME_IN', confidence: prob };
      }
      return { action: 'SILENT', confidence: prob, choice };
    }
  } catch (err) {
    console.error('[LAYA-MLX] Error en classifyLurkIntervention:', err.message);
  }

  return { action: 'SILENT', confidence: 1.0, reason: 'fallback' };
}

module.exports = {
  askSystemOne,
  classifySchoolNotice,
  isTrivialMessage,
  classifyUserIntent,
  classifyExpenseCategory,
  classifyLifePilar,
  isChatHistoryQuestion,
  classifyStickerIntent,
  classifySubject,
  classifyBotMention,
  classifyClosingMessage,
  classifySearchCommand,
  classifyMessageComplexity,
  classifyTaskActionability,
  detectHumanAddressee,
  classifyLurkIntervention,
  pickModel
};

