const notionActions = require('./notion-actions.js');
const financeReport = require('./finance-report.js');
const dailyBriefing = require('./daily-briefing.js');
const secondBrainAuditor = require('./second-brain-auditor.js');
const classNotesManager = require('./class-notes-manager.js');
const { askSystemOne, classifyUserIntent, classifyLifePilar, classifySubject, classifyTaskActionability } = require('./system-one-client.js');


// ============================================================================
// 1. DICCIONARIOS Y MATRICES DE PATRONES BASADOS EN EL CORPUS REAL DE WHATSAPP
// ============================================================================

// --- GASTOS Y FINANZAS (Extraído de patrones reales de Angel, BBVA, OXXO, transferencias y salidas) ---
const TRANSACTION_PATTERNS = [
  // Montos explícitos con verbos directos ("gasté $120 en uber", "pagué 45 de tacos", "compré $300 de fresas")
  /(?:gast[eé]|gasto|pagu[eé]|pago|compr[eé]|compro|transfer[ií]|transferencia|deposit[eé]|cost[oó]|fueron|sali[oó]\s+en|solt[eé]|le\s+pas[eé]|pas[eé]|mand[eé])\s*(?:de\s+)?(?:\$|pesos|mxn)?\s*([0-9]+(?:[\.,][0-9]{1,2})?)\s*(?:pesos|mxn|varos|pesitos|bolas|baros)?\s*(?:en|de|para|por|a)?\s*(.*)/i,
  // Modismos mexicanos ("300 varos de tacos", "50 bolas de uber", "le di 100 pesos a...")
  /(?:le\s+di|le\s+puse|di)\s*(?:\$)?\s*([0-9]+(?:[\.,][0-9]{1,2})?)\s*(?:pesos|mxn|varos|bolas|baros)\s*(?:en|de|para|por|a)?\s*(.*)/i,
  // Montos con sujetos plurales / compartidos ("nos costó $80", "me cobraron $150", "pagamos 500")
  /(?:me\s+cost[oó]|nos\s+cost[oó]|me\s+cobraron|nos\s+cobraron|pagamos|gastamos)\s*(?:\$|pesos|mxn)?\s*([0-9]+(?:[\.,][0-9]{1,2})?)\s*(?:pesos|mxn|varos)?\s*(?:en|de|para|por)?\s*(.*)/i,
  // Sintaxis rápida de inicio de mensaje ("$50 en uber", "$120 comida", "200 varos de cena")
  /^(?:\$)?([0-9]+(?:[\.,][0-9]{1,2})?)\s*(?:pesos|mxn|varos|bolas)\s*(?:en|de|para)?\s*(.+)/i,
  /^\$([0-9]+(?:[\.,][0-9]{1,2})?)\s*(?:pesos|mxn)?\s*(?:en|de|para)?\s*(.+)/i,
  // Pagos sin monto explícito ("ya pagué netflix", "ya pagué la luz", "ya compré el jamón y pala", "te compré algo")
  /(?:ya\s+pagu[eé]|ya\s+compr[eé]|te\s+compr[eé]|te\s+compre|ya\s+transfer[ií]|acabo\s+de\s+comprar|compr[eé])\s+(?:lo\s+de\s+|un[ao]?s?\s+|el\s+|la\s+|mi\s+|tu\s+)?(.+)/i
];

// Frases de ubicación actual, presencia, estado personal o charla casual que NUNCA deben interpretarse como tareas
const CONVERSATIONAL_OR_LOCATION_REGEX = /^(?:si\s+)?(?:ya\s+)?(?:estoy|ando|estamos|llegu[eé]|llegamos|vengo|voy\s+llegando|voy\s+en\s+camino|en\s+camino|aqu[ií]\s+ando|aqu[ií]\s+estoy|cerca\s+estoy|lejos\s+estoy|estoy\s+en|ando\s+en|ya\s+sal[ií]|ya\s+entr[eé]|aqu[ií]\s+en|ora\b|orale\b|ah\b|sim[oó]n\b|pero\s+pues|pues\s+cerca)\b/i;

// Mapeo semántico de categorías de gasto
const EXPENSE_CATEGORIES = {
  comida: /(?:tacos|hamburguesa|carls\s*jr|comida|cenar|desayunar|fresas|jam[oó]n|elote|pepino|pollo|restaurante|caf[eé]|oxxo|cena|alitas|pizza|barbacoa)/i,
  transporte: /(?:uber|didi|cami[oó]n|gasolina|tren|pasaje|movilidad|ruta|tarjeta\s+de\s+transporte)/i,
  servicios: /(?:luz|telmex|netflix|spotify|cfe|internet|agua|celular|plan)/i,
  universidad: /(?:examen|constancia|cucea|credencial|libros|papeler[ií]a|copias|cuaderno|kardex)/i,
  hobbies: /(?:estambre|crochet|amigurumi|peluca|cosplay|patines|steam|juego|boletos|concierto)/i
};

// --- COMPROMISOS Y TAREAS (Extraído de frases reales de Angel y chats de equipo) ---
const TASK_PATTERNS = [
  // Expresiones de necesidad personal ("tengo que ir a sacar la tarjeta", "debo subir la práctica", "me falta...")
  /(?:tengo\s+que|debo\s+de|debo|me\s+falta|hay\s+que|falta\s+(?:de\s+)?)\s+(?!(?:dormir|mimir|descansar|acostarme|dormirme)\b)(.+)/i,
  // Promesas y planes a corto plazo ("voy a comprar...", "mañana voy a subir...", "al rato lo hago")
  /(?:voy\s+a|mañana\s+voy\s+a|al\s+rato\s+voy\s+a|llegando\s+voy\s+a)\s+(?!(?:dormir|mimir|descansar|acostarme|dormirme|salir|irme|ir\s+a\s+dormir|ir\s+a\s+mimir)\b)(.+)/i,
  // Olvidos y pendientes inmediatos ("se me olvidó comprar...", "olvidé subir...", "no se me olvide...")
  /(?:se\s+me\s+olvid[oó]|olvid[eé]|se\s+me\s+pas[oó]|acordarme\s+de|acordarse\s+de)\s+(.+)/i,
  // Compromisos directos de Angel ("yo lo hago", "yo me encargo", "yo lo subo")
  /(?:yo\s+(?:lo\s+hago|me\s+encargo|lo\s+subo|lo\s+mando|te\s+lo\s+paso|lo\s+checo|lo\s+reviso|lo\s+compro|pago))\s*(?:de\s+)?(.+)?/i,
  // Expresiones de temporalidad ("llegando a mi casa lo hago", "acabando la clase lo subo")
  /(?:al\s+rato|llegando|acabando)\s+(?:lo\s+hago|lo\s+subo|lo\s+termino|te\s+lo\s+paso|hago|subo|termino)\s*(.+)?/i,
  // Recordatorios y alertas ("acuérdate de llevar la credencial", "no olvidar entregar...")
  /(?:acu[eé]rdate\s+de|no\s+olvidar|no\s+se\s+te\s+vaya\s+a\s+olvidar|recordar|recu[eé]rdame)\s+(.+)/i,
  // Formato explícito de tarea ("tarea: ...", "pendiente: ...", "- [ ] ...")
  /^(?:tarea:?|pendiente:?|por\s+hacer:?|to-do:?)\s*(.+)/i,
  /^-\s*\[\s*\]\s*(.+)/i,
  // Verbos de acción en infinitivo o imperativo al inicio del mensaje
  /^(?:comprar|pagar|entregar|subir|revisar|sacar|preguntar|llevar|terminar|investigar|preparar|agendar|inscribir|mandar|descargar|checar|hacer|definir|actualizar|corregir)\s+(.+)/i
];

// --- PLANES DE CITAS Y SALIDAS (Pilar Vida Personal ➔ Proyecto Date Planning) ---
const DATE_PLANNING_PATTERNS = [
  /(?:vamos\s+a\s+ir\s+a|podamos\s+ir\s+a|vamos\s+a\s+(?:cenar|comer|desayunar|salir|el\s+cine|la\s+cineteca|plaza|andares|galer[ií]as|centro|correr|el\s+gym|los\s+patines))\s*(.*)/i,
  /(?:plan\s+de\s+(?:cita|salida|cena|fin\s+de\s+semana|aniversario)|cita\s+en|salida\s+a|aniversario|mes\s+aniversario)\s*(.*)/i,
  /(?:compro\s+los\s+boletos|comprar\s+los\s+boletos|boletos\s+para\s+el\s+cine)\s*(.*)/i,
  /(?:el\s+(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)|fin\s+de\s+semana)\s+(?:vamos\s+(?:a|con)|tenemos\s+que\s+ir|vamos\s+a\s+ir)\s*(.*)/i,
  /(?:vamos\s+con\s+(?:tu\s+)?(?:nana|abuela|abuelo|familia|mam[aá]|pap[aá]))\s*(.*)/i,
  /(?:vamos\s+a\s+(?:ver\s+a\s+|visitar\s+a\s+)(?:tu\s+)?(?:nana|abuela|abuelo|familia|mam[aá]|pap[aá]))\s*(.*)/i
];

// --- NOTAS RÁPIDAS E IDEAS ---
const NOTE_PATTERNS = [
  /^(?:nota:?|idea:?|apunte:?|tip:?)\s+(.+)/i
];

// --- CREACIÓN DE PROYECTOS NUEVOS ---
const PROJECT_PATTERNS = [
  /^(?:nuevo\s+proyecto:?|idea\s+de\s+proyecto:?|proyecto\s+nuevo:?)\s+(.+)/i
];

// --- RECORDATORIOS CON HORA Y FECHA (Natural Language Reminders) ---
const REMINDER_PATTERNS = [
  /(?:(?:le\s+)?puedes\s+poner\s+un\s+recordatorio\s+(?:a\s+([a-zá-ú]+)\s+)?de\s+que|pon(?:le)?\s+un\s+recordatorio\s+(?:a\s+([a-zá-ú]+)\s+)?de\s+que|recu[eé]rdale\s+a\s+([a-zá-ú]+)\s+que|recu[eé]rdame\s+(?:a\s+m[ií]\s+)?que|agenda(?:r)?\s+(?:que|un\s+recordatorio\s+de)?)\s*(.+)/i,
  /^(?:recordatorio:?|recordar:?|agendar:?)\s+(.+)/i
];

function extractDateTime(text) {
  let clean = text.replace(/[?¿!¡]/g, ' ')
    .replace(/(?:\s*(?:plis+|por\s*fa(?:vor)?|plz|gracias|🙏🏻|✨|xd|:3|\(.*?\)|porfa))+\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Buscar hora: '10:30 pm', '10:30pm', '10 pm', '22:30', '10:30'
  const timeRegex = /(?:a\s+las?\s+)?([0-9]{1,2})(?::([0-9]{2}))?\s*(am|pm|hrs?|horas?)?/i;
  const match = clean.match(timeRegex);

  let hours = 12, minutes = 0;
  let hasTime = false;

  if (match && match[1]) {
    hasTime = true;
    hours = parseInt(match[1], 10);
    minutes = match[2] ? parseInt(match[2], 10) : 0;
    const ampm = match[3] ? match[3].toLowerCase() : null;

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
  }

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  let y = now.getFullYear();
  let m = pad(now.getMonth() + 1);
  let d = pad(now.getDate());

  if (/mañana/i.test(clean)) {
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    y = tomorrow.getFullYear();
    m = pad(tomorrow.getMonth() + 1);
    d = pad(tomorrow.getDate());
  }

  const isoWithOffset = `${y}-${m}-${d}T${pad(hours)}:${pad(minutes)}:00.000-06:00`;
  const timeDisplay = `${pad(hours)}:${pad(minutes)} hrs`;

  return { cleanText: clean, hasTime, hours, minutes, isoWithOffset, timeDisplay };
}

// ============================================================================
// 2. MATRICES DE RESOLUCIÓN JERÁRQUICA (Life Pillar ➔ Proyecto ➔ Tarea)
// ============================================================================

const MATERIAS_VOCABULARY = [
  { id: '24a853a1-d77e-80ec-bf20-e4fe770d19b2', name: 'Programación Web', regex: /(?:programaci[oó]n\s+web|\bweb\b|fregoso|html|css|bootstrap|javascript|php)/i },
  { id: '24a853a1-d77e-8025-9f0d-f27304f4840d', name: 'Bases de Datos II', regex: /(?:bases\s+de\s+datos|\bbd2\b|\bbd\b|mysql|joins|der|diagrama\s+entidad|sql|martha)/i },
  { id: '24a853a1-d77e-8056-b6cc-e40fe1c1cbfb', name: 'Fundamentos de Redes', regex: /(?:fundamentos\s+de\s+redes|\bredes\b|cisco|packet\s+tracer|claustro|\bip\b|subred|switch|router)/i },
  { id: '24a853a1-d77e-8088-8d79-efd519fb7db5', name: 'Inteligencia de Negocios', regex: /(?:inteligencia\s+de\s+negocios|\bbi\b|data\s*warehouse|rodriguez\s+guiza|\bkpi\b|\betl\b)/i },
  { id: '24a853a1-d77e-80d3-8c05-e04170ebb809', name: 'Ingeniería de Software', regex: /(?:ingenier[ií]a\s+de\s+software|\bsoftware\b|casos?\s+de\s+uso|scrum|\buml\b|duran\s+limon)/i },
  { id: '24a853a1-d77e-80be-9d0b-ffa2a40bb0dc', name: 'Administración de TI', regex: /(?:administraci[oó]n\s+de\s+ti|admin\s+ti|l[ií]der\s+de\s+proyecto|daniel\s+mu[ñn]oz|equipo\s+3)/i },
  { id: '24a853a1-d77e-80c2-a2b1-eab3662e0fa3', name: 'Gestión de TI II', regex: /(?:gesti[oó]n\s+de\s+servicios|gesti[oó]n\s+de\s+ti|itil|lopez\s+campos|servicios\s+ti)/i },
  { id: '24a853a1-d77e-8035-965a-fa63d76378e9', name: 'Big data', regex: /(?:big\s+data|hadoop|spark|barbosa|santillan)/i }
];

const LIFE_PILARS_VOCABULARY = [
  { key: 'profesional', id: '249853a1-d77e-80b0-b667-d9bb9eeef7f4', regex: /(?:kessoku\s+dev|goldencode|portafolio|chamba|trabajo|cv|empleo|cliente|agencia|entrevista)/i },
  { key: 'universidad', id: '249853a1-d77e-80d7-ad03-d7242c666254', regex: /(?:cucea|universidad|udg|campus|profesor|profe|docente|clase|examen|kardex|tarea|classroom|moodsi|moodle|pr[aá]ctica|materia|ventanilla|horario|semestre)/i },
  { key: 'hobbies', id: '249853a1-d77e-80d7-b24e-f2590a309575', regex: /(?:crochet|amigurumi|estambre|patr[oó]n|tejer|hollow\s+knight|forza|elden\s+ring|bocchi|kessoku\s+band|one\s+piece|digimon|cosplay|manga|anime|fotograf[ií]a|macro)/i },
  { key: 'finanzas', id: '265853a1-d77e-8001-8f07-f4fc96d1a513', regex: /(?:\b(?:dinero|tarjeta|banco|bbva|oxxo|transferencia|clabe|lana|feria|deuda|ahorro|presupuesto|factura)\b|cuenta\s+bancaria)/i },
  { key: 'vida personal', id: '249853a1-d77e-809b-bd22-d1594343275d', regex: /(?:erika|cita|aniversario|salida|cine|cineteca|cenar|comer|correr|atletismo|10k|5k|carrera|leones\s+negros|patines|gym)/i }
];

async function resolveLifePilar(text) {
  try {
    const pilarKey = await classifyLifePilar(text);
    if (pilarKey) {
      const match = LIFE_PILARS_VOCABULARY.find(p => p.key === pilarKey || (pilarKey === 'vida_personal' && p.key === 'vida personal'));
      if (match) return { name: match.key, id: match.id };
    }
  } catch (err) {
    console.error('[RESOLVE PILAR] Error en Laya-MLX:', err.message);
  }

  return { name: 'vida personal', id: '249853a1-d77e-809b-bd22-d1594343275d' };
}

async function resolveMateria(text) {
  try {
    const subjectKey = await classifySubject(text);
    if (subjectKey) {
      const keyMap = {
        web: 'Programación Web',
        bd: 'Bases de Datos II',
        redes: 'Fundamentos de Redes',
        bi: 'Inteligencia de Negocios',
        software: 'Ingeniería de Software',
        admin_ti: 'Administración de TI',
        gestion_ti: 'Gestión de TI II',
        big_data: 'Big data'
      };
      const canonicalName = keyMap[subjectKey];
      if (canonicalName) {
        return MATERIAS_VOCABULARY.find(m => m.name.toLowerCase() === canonicalName.toLowerCase()) || null;
      }
    }
  } catch (err) {
    console.error('[RESOLVE MATERIA] Error en Laya-MLX:', err.message);
  }

  return null;
}

function matchExistingProject(text, projects) {
  const lower = text.toLowerCase();

  // Coincidencias temáticas directas a proyectos existentes conocidos
  if (/(?:erika|cita|cine|cineteca|cenar|comer|aniversario|mes\s+aniversario|salida)/i.test(lower)) {
    const dp = projects.find(p => p.name.toLowerCase().includes('date planning'));
    if (dp) return dp;
  }
  if (/(?:cosplay|light\s+yagami|peluca|corbata\s+roja)/i.test(lower)) {
    const cp = projects.find(p => p.name.toLowerCase().includes('cosplay'));
    if (cp) return cp;
  }
  if (/(?:tarjeta\s+movilidad|mi\s+movilidad|cita\s+tarjeta|comprobante\s+domicilio)/i.test(lower)) {
    const tm = projects.find(p => p.name.toLowerCase().includes('movilidad'));
    if (tm) return tm;
  }
  if (/(?:chamba|cv|postulaci[oó]n|entrevista\s+de\s+trabajo)/i.test(lower)) {
    const cc = projects.find(p => p.name.toLowerCase().includes('chamba'));
    if (cc) return cc;
  }
  if (/(?:lista\s+de\s+compras|comprar\s+para\s+la\s+casa)/i.test(lower)) {
    const lc = projects.find(p => p.name.toLowerCase().includes('compras'));
    if (lc) return lc;
  }

  for (const p of projects) {
    if (lower.includes(p.name.toLowerCase())) {
      return p;
    }
  }
  return null;
}

const HELP_GUIDE_MESSAGE = `🤖 *ANTIGRAVITY BOT — MANUAL DE COMANDOS & HERRAMIENTAS*

Bienvenido al sistema de automatizaciones de WhatsApp & macOS. Aquí tienes el mapa completo de capacidades activas:

══════════════════════════════
🧠 *1. ASISTENTE INTELIGENTE & CHARLA*
══════════════════════════════
• *!ia <pregunta>* | *@antigravity <pregunta>*
  Inicia una sesión con la IA. En chats de amigos o grupos, abre una ventana de 90 segundos para seguir hablando fluido sin repetir comandos.
• *Citar / Deslizar (Quote)*
  Si citas cualquier mensaje enviado previamente por el bot, se reactiva de inmediato en modo activo.
• *Modo Chismoso (Ambient Listening)*
  Tras 90s sin hablarle directo, pasa a modo silencioso acumulando el contexto en SQLite. Si le preguntas después, ¡ya sabe de qué estaban hablando!
• *Despedida:*
  Decir *"muchas gracias"*, *"bye"* o *"ya me voy a mimir"* cierra la sesión a IDLE para ahorrar recursos.

══════════════════════════════
🔍 *2. BÚSQUEDA EN HISTORIAL (RAG LOCAL FTS5)*
══════════════════════════════
• *!buscar <término>* | */buscar <término>*
  Busca en el historial real de WhatsApp indexado con SQLite FTS5 (<15 ms).
  _Ejemplo:_ \`!buscar examen redes\` o \`!buscar comprobante oxxo\`

══════════════════════════════
⚡ *3. GESTOR DE NOTION (SECOND BRAIN)*
══════════════════════════════
• *Registro de Tareas & Pendientes:*
  Detecta lenguaje natural y lo manda a Notion (con fecha y materia).
  _Ejemplos:_
  - \`tengo que subir la práctica 4 de redes para mañana a las 3pm\`
  - \`recuérdame pagar el agua el viernes a las 11am\`
  - \`tarea: estudiar para bases de datos\`
• *Registro de Gastos & Finanzas:*
  Guarda transacciones en la DB financiera de Notion.
  _Ejemplos:_
  - \`gasté $120 en uber\`
  - \`pagué 45 pesos de tacos\`
  - \`ya pagué netflix\`
• *Date Planning (Planes de Pareja):*
  Exclusivo con Erika y chat personal.
  _Ejemplo:_ \`vamos a cenar alitas el sábado\`
• *Reporte Financiero:*
  Pregunta \`corte de gastos\` o \`cómo van mis finanzas\`.
• *Daily Briefing:*
  Pregunta \`dame mi agenda de hoy\` o \`briefing matutino\`.

══════════════════════════════
🧾 *4. OCR & PROCESAMIENTO MULTIMEDIA*
══════════════════════════════
• *Tickets y Transferencias (Imágenes):*
  Envía foto o captura de pago (BBVA, Santander, Nu, OXXO). Hace OCR local, extrae monto y comercio, y lo anota en Notion.
• *Audios y Notas de Voz:*
  Manda cualquier audio de WhatsApp; se transcribe en local con Whisper y extrae compromisos automáticamente.
• *Documentos & PDFs:*
  Lectura y análisis directo de archivos adjuntos.

══════════════════════════════
🏫 *5. AVISOS DE CUCEA & RECORDATORIOS PROACTIVOS*
══════════════════════════════
• *Detector de Avisos Universitarios:*
  Monitorea grupos de CUCEA para detectar cancelaciones (\`🚨 No hay clase\`), sesiones virtuales (\`💻 Clase virtual\`) o cambios de aula (\`⚠️ Cambio de aula\`).
• *Latido Proactivo (Deadlines):*
  Te avisa por WhatsApp 5 horas y 2 horas antes de que venza una entrega de Notion.
• *Aviso de Salida a Campus:*
  Te manda alerta ~45 minutos antes de que empiece tu clase en CUCEA.

══════════════════════════════
💻 *6. SYSADMIN REMOTO MACOS (CLI)*
══════════════════════════════
• *!mac <comando>*
  Ejecuta consultas de estado en tu Mac (batería, uptime, procesos).
• *notify-wa:*
  CLI en terminal zsh para mandarte alertas directo a WhatsApp.

══════════════════════════════
💡 *Atajo rápido:* Escribe *-help* o *!ia -help* en cualquier momento para ver esta guía :3`;

// ============================================================================
// 3. MOTOR EXTRACTOR PRINCIPAL
// ============================================================================

class PassiveExtractor {
  constructor() {
    this.lastCreatedTaskId = null;
    this.lastCreatedTaskTitle = null;
    this.lastCreatedTaskTimestamp = null;
  }

  /**
   * Cancela y archiva en Notion la última tarea creada por el extractor
   */
  async cancelLastCreatedTask() {
    try {
      let targetId = this.lastCreatedTaskId;
      let targetTitle = this.lastCreatedTaskTitle;

      // Si no está en memoria o hubo reinicio del daemon, buscar en Notion la última tarea creada en los últimos 30 min
      if (!targetId) {
        const latest = await notionActions.getLatestTask(30);
        if (latest) {
          targetId = latest.id;
          targetTitle = latest.title;
        }
      }

      if (!targetId) {
        return 'No encontré ninguna tarea reciente en Notion para cancelar o ya había sido eliminada :3';
      }

      await notionActions.archiveTask(targetId);
      const titleClean = targetTitle || 'esa tarea';

      this.lastCreatedTaskId = null;
      this.lastCreatedTaskTitle = null;
      this.lastCreatedTaskTimestamp = null;

      return `¡Listo! Ya cancelé y eliminé de Notion la tarea: *${titleClean}* para que no te quede basura en el Second Brain :3`;
    } catch (err) {
      console.error('[EXTRACTOR] Error cancelando tarea:', err.message);
      return `Hubo un detalle al intentar eliminar la tarea en Notion: ${err.message} :(`;
    }
  }

  async processMessage(text, isSelf = false, context = {}) {
    if (!text || text.length < 2) return null;
    const cleanText = text.trim();

    // Detección directa de queja o cancelación de tarea ("eso no es una tarea", "borra esa tarea", etc.)
    if (/(?:eso\s+no\s+(?:es|era)\s+(?:una\s+)?tarea|no\s+es\s+tarea|borra\s+(?:esa\s+)?tarea|elimina\s+(?:esa\s+)?tarea|cancela\s+(?:esa\s+)?tarea|ora,?\s+eso\s+no\s+es\s+(?:una\s+)?tarea)/i.test(cleanText)) {
      const cancelMsg = await this.cancelLastCreatedTask();
      return {
        action: 'task_canceled',
        message: cancelMsg
      };
    }

    // Detección directa de manual de ayuda (-help, --help, help, !help, !ia -help)
    if (/^(?:[!/]ia\s+)?(?:-h\b|--help\b|-help\b|help\b|[!/]help\b|\?\s*$)/i.test(cleanText)) {
      return {
        action: 'help_manual',
        message: HELP_GUIDE_MESSAGE
      };
    }

    // Guard: Si el mensaje es una despedida, agradecimiento de cierre o ir a dormir, NO es una tarea ni gasto
    if (/(?:me\s+voy\s+a\s+(?:mimir|dormir|descansar|acostar)|(?:ya\s+)?(?:a\s+mimir|a\s+dormir|a\s+descansar)|hasta\s+mañana|buenas\s+noches|que\s+descanses)\b/i.test(cleanText)) {
      if (!/(?:recu[eé]rda|tarea:|pendiente:|no\s+olvidar|\$|\bpesos\b)/i.test(cleanText)) {
        return null;
      }
    }

    // Clasificación de intención semántica 100% con Laya-MLX (Sistema 1 en GPU Metal)
    const userIntent = await classifyUserIntent(cleanText);

    // Gate de dueño (spec passive-extractor): agenda, finanzas y auditoría
    // solo disparan en el chat propio, nunca en chats de terceros.
    const isOwnerChat = !!(context && context.isMyOwnChat);
    if ((userIntent === 'daily_briefing' || userIntent === 'corte_gastos' || userIntent === 'auditoria_notion') && !isOwnerChat) {
      return null;
    }

    // Pre-filtro saludo-vs-briefing: un "buenos días" sin petición explícita
    // de agenda no genera briefing (caso real observado con Laya).
    if (userIntent === 'daily_briefing' && !/(agenda|briefing|brief|dame mi|resumen|c[óo]mo va mi)/i.test(cleanText)) {
      return null;
    }

    if (userIntent === 'corte_gastos') {
      try {
        const report = await financeReport.generateWeeklyReport();
        return { action: 'finance_report', message: report.message };
      } catch (err) {
        console.error('[EXTRACTOR] Error generando reporte financiero:', err.message);
      }
    }

    if (userIntent === 'daily_briefing') {
      try {
        const briefingMsg = await dailyBriefing.generateBriefingMessage();
        return { action: 'daily_briefing', message: briefingMsg };
      } catch (err) {
        console.error('[EXTRACTOR] Error generando daily briefing bajo demanda:', err.message);
      }
    }

    if (userIntent === 'auditoria_notion') {
      try {
        const report = await secondBrainAuditor.runFullAudit(true, false);
        return { action: 'notion_audit', message: report.whatsappMessage };
      } catch (err) {
        console.error('[EXTRACTOR] Error en auditoría bajo demanda:', err.message);
      }
    }

    // Comandos de Clase Universitaria (Whisper + Notion)
    if (userIntent === 'clase_start') {
      try {
        const startClassMatch = cleanText.match(/(?:de|materia)\s+(.+)$/i);
        const requestedSubject = startClassMatch ? startClassMatch[1].trim() : '';
        const startResult = await classNotesManager.startRecording(requestedSubject);
        return { action: 'start_class_recording', message: startResult.message };
      } catch (err) {
        console.error('[EXTRACTOR] Error iniciando grabación de clase:', err.message);
      }
    }

    if (userIntent === 'clase_status') {
      try {
        const status = await classNotesManager.getRecordingStatus();
        if (!status.isRecording) {
          return {
            action: 'class_status',
            message: `Ahorita no hay ninguna clase grabándose. Para arrancar una, solo dime *"empieza a grabar clase"* o en la Mac escribe \`clase\` :3`
          };
        }
        let snippetText = '';
        if (status.lastLines && status.lastLines.length > 0) {
          snippetText = `\n\nÚltimo que captó el micro:\n_${status.lastLines[status.lastLines.length - 1]}_`;
        }
        return {
          action: 'class_status',
          message: `Seguimos grabando *${status.materia}*, van ${status.elapsedMins} minutos (${status.chunksProcessed} bloques de audio).${snippetText}\n\nCuando termine dime *"termina la clase"* :3`
        };
      } catch (err) {
        console.error('[EXTRACTOR] Error consultando estado de clase:', err.message);
      }
    }

    if (userIntent === 'clase_stop') {
      try {
        const stopResult = await classNotesManager.stopAndGenerateNotes();
        return { action: 'stop_class_and_generate_notes', message: stopResult.message };
      } catch (err) {
        console.error('[EXTRACTOR] Error terminando clase y generando apuntes:', err.message);
      }
    }

    // 0. Detección de Recordatorio Específico con Hora / Fecha

    for (const pat of REMINDER_PATTERNS) {
      const match = cleanText.match(pat);
      if (match) {
        const targetPerson = match[1] || match[2] || match[3] || 'Ángel';
        const rawContent = (match[4] || match[1] || '').trim();
        const { cleanText: reminderBody, hasTime, isoWithOffset, timeDisplay } = extractDateTime(rawContent || cleanText);

        const pilar = await resolveLifePilar(reminderBody);
        const projects = await notionActions.getActiveProjects();
        let matchedProj = matchExistingProject(reminderBody, projects);

        // Si es con Erika o relacionado a pareja/citas, asociar a Date Planning
        if (!matchedProj && /(?:erika|chupar|beso|cena|salida|cita|amor|novi[ao]|nana)/i.test(cleanText)) {
          matchedProj = projects.find(p => p.name.toLowerCase().includes('date planning'));
        }

        const taskTitle = `Recordatorio: ${reminderBody}`;

        try {
          const createdTask = await notionActions.createTask(taskTitle, {
            pilarId: pilar.id,
            projectId: matchedProj ? matchedProj.id : undefined,
            dueDate: hasTime ? isoWithOffset : undefined,
            priority: 'Alta',
            description: `Recordatorio agendado vía WhatsApp para ${targetPerson} (${hasTime ? timeDisplay : 'Sin hora específica'}).`
          });

          if (createdTask && createdTask.id) {
            this.lastCreatedTaskId = createdTask.id;
            this.lastCreatedTaskTitle = taskTitle;
            this.lastCreatedTaskTimestamp = Date.now();
          }

          let destInfo = `Pilar: *${pilar.name}*`;
          if (matchedProj) destInfo += ` ➔ Proyecto: *${matchedProj.name}*`;
          if (hasTime) destInfo += ` ➔ Fecha/Hora: *${timeDisplay}*`;

          return {
            action: 'reminder',
            title: taskTitle,
            autoCreated: true,
            message: `Anotado para ${targetPerson}: *${reminderBody}* (${destInfo}) :3`
          };
        } catch (err) {
          console.error('[EXTRACTOR] Error guardando recordatorio:', err.message);
        }
      }
    }

    // 1. Detección de Transacción / Gasto
    for (const pat of TRANSACTION_PATTERNS) {
      const match = cleanText.match(pat);
      if (match) {
        let amount = null;
        let concept = null;

        if (match[2] !== undefined) {
          amount = parseFloat(match[1].replace(',', '.'));
          concept = match[2].trim() || 'Gasto registrado';
        } else if (match[1]) {
          // Caso sin monto numérico ("ya pagué netflix")
          concept = match[1].trim();
        }

        if (amount !== null || concept) {
          try {
            await notionActions.createTransaction({
              amount: amount || 0,
              concept: concept,
              type: 'Gasto'
            });
            const montoFmt = amount ? `$${amount} MXN` : '(Monto no especificado)';
            return {
              action: 'transaction',
              amount: amount,
              concept: concept,
              message: `Anoté el gasto: *${montoFmt}* en *${concept}* en Notion :3`
            };
          } catch (err) {
            console.error('[EXTRACTOR] Error guardando transacción:', err.message);
          }
        }
      }
    }

    // 2. Detección de Creación de Proyecto Nuevo
    for (const pat of PROJECT_PATTERNS) {
      const match = cleanText.match(pat);
      if (match) {
        const projName = match[1].trim();
        const pilar = await resolveLifePilar(cleanText);
        try {
          await notionActions.createProject(projName, pilar.id);
          return {
            action: 'project',
            name: projName,
            pilar: pilar.name,
            message: `Listo, creé el proyecto *${projName}* en *${pilar.name}* :3`
          };
        } catch (err) {
          console.error('[EXTRACTOR] Error creando proyecto:', err.message);
        }
      }
    }

    // 3. Detección de Notas Rápidas
    for (const pat of NOTE_PATTERNS) {
      const match = cleanText.match(pat);
      if (match) {
        const content = match[1].trim();
        const title = content.length > 40 ? content.slice(0, 40) + '...' : content;
        const pilar = await resolveLifePilar(cleanText);
        const materia = resolveMateria(cleanText);

        try {
          await notionActions.createNote(title, content, {
            pilarId: pilar.id,
            materiaId: materia ? materia.id : undefined
          });
          return {
            action: 'note',
            title: title,
            message: `Guardé la nota: *${title}* en *${pilar.name}*${materia ? ` (${materia.name})` : ''} :3`
          };
        } catch (err) {
          console.error('[EXTRACTOR] Error guardando nota:', err.message);
        }
      }
    }

    // 4. Detección de Planes de Citas / Salidas con Erika (Vida Personal ➔ Date Planning)
    // Solo permitida en chats de pareja (Erika) o chat propio de Ángel
    const isCoupleChat = isSelf || (context && (context.isFromErika || context.isMyOwnChat));
    if (isCoupleChat) {
      for (const pat of DATE_PLANNING_PATTERNS) {
        const match = cleanText.match(pat);
        if (match) {
          const actionability = await classifyTaskActionability(cleanText);
          if (!actionability.isActionable) {
            console.log(`🛡️ [ACTIONABILITY GATE] Candidato a Date Planning descartado por ocio/descanso (${(actionability.confidence * 100).toFixed(1)}%): "${cleanText}"`);
            continue;
          }

          const planText = cleanText;
          const projects = await notionActions.getActiveProjects();
          const dateProj = projects.find(p => p.name.toLowerCase().includes('date planning'));

          if (isSelf) {
            try {
              const createdTask = await notionActions.createTask(planText, {
                pilarId: '249853a1-d77e-809b-bd22-d1594343275d', // Vida personal
                projectId: dateProj ? dateProj.id : undefined
              });

              if (createdTask && createdTask.id) {
                this.lastCreatedTaskId = createdTask.id;
                this.lastCreatedTaskTitle = planText;
                this.lastCreatedTaskTimestamp = Date.now();
              }

              return {
                action: 'task',
                title: planText,
                message: `Anotado en Date Planning: *${planText}* :3`
              };
            } catch (err) {
              console.error('[EXTRACTOR] Error guardando plan de salida:', err.message);
            }
          } else {
            return {
              action: 'task_proposal',
              title: planText,
              pilar: 'Vida personal',
              project: 'Date Planning',
              autoCreated: false
            };
          }
        }
      }
    }

    // Guard determinista: Si es charla casual, ubicación actual o presencia, NO es tarea (a menos que use sintaxis explícita)
    const isExplicitTaskSyntax = /^(?:tarea:?|pendiente:?|to-do:?|por\s+hacer:?)\s+/i.test(cleanText) || /^-\s*\[\s*\]\s+/i.test(cleanText);
    if (!isExplicitTaskSyntax && CONVERSATIONAL_OR_LOCATION_REGEX.test(cleanText)) {
      return null;
    }

    // 5. Detección General de Tareas y Compromisos
    for (const pat of TASK_PATTERNS) {
      const match = cleanText.match(pat);
      if (match) {
        const taskTitle = match[1] ? match[1].trim() : cleanText;
        const IGNORE_TITLES = /^(?:mimir|dormir|descansar|acostarme|dormirme|salir|irme|nada|listo|ok|bye|adi[oó]s)$/i;
        if (IGNORE_TITLES.test(taskTitle) || taskTitle.length < 3) {
          continue;
        }

        // Actionability Gate: Validar semánticamente con Laya-MLX si el mensaje es una obligación o descanso/ocio
        if (!isExplicitTaskSyntax) {
          const actionability = await classifyTaskActionability(cleanText);
          if (!actionability.isActionable) {
            console.log(`🛡️ [ACTIONABILITY GATE] Candidato descartado por ocio/descanso (${(actionability.confidence * 100).toFixed(1)}%): "${cleanText}"`);
            continue;
          }
        }

        const pilar = await resolveLifePilar(cleanText);
        const materia = resolveMateria(cleanText);

        const projects = await notionActions.getActiveProjects();
        const matchedProj = matchExistingProject(cleanText, projects);

        if (isSelf) {
          try {
            const createdTask = await notionActions.createTask(taskTitle, {
              pilarId: pilar.id,
              materiaId: materia ? materia.id : undefined,
              projectId: matchedProj ? matchedProj.id : undefined
            });

            if (createdTask && createdTask.id) {
              this.lastCreatedTaskId = createdTask.id;
              this.lastCreatedTaskTitle = taskTitle;
              this.lastCreatedTaskTimestamp = Date.now();
            }

            let destInfo = pilar.name;
            if (matchedProj) destInfo += ` • ${matchedProj.name}`;
            if (materia) destInfo += ` • ${materia.name}`;

            return {
              action: 'task',
              title: taskTitle,
              autoCreated: true,
              message: `Anoté la tarea: *${taskTitle}* (${destInfo}) :3`
            };
          } catch (err) {
            console.error('[EXTRACTOR] Error guardando tarea automática:', err.message);
          }
        } else {
          return {
            action: 'task_proposal',
            title: taskTitle,
            pilar: pilar.name,
            project: matchedProj ? matchedProj.name : (materia ? materia.name : null),
            autoCreated: false
          };
        }
      }
    }

    // 6. Fallback Inteligente con Sistema 1 (Laya-MLX) para tareas/compromisos
    // Si ninguna regex rígida coincidió, requiere verbo de acción Y alta certeza (>= 0.85)
    const HAS_ACTION_VERB = /^(?:hacer|terminar|subir|enviar|mandar|preparar|revisar|comprar|pagar|sacar|ir\s+a\s+(?!dormir|mimir|descansar)|entregar|estudiar|investigar|agendar|actualizar|definir|corregir)\b/i.test(cleanText);
    if (!isExplicitTaskSyntax && !CONVERSATIONAL_OR_LOCATION_REGEX.test(cleanText) && (HAS_ACTION_VERB || cleanText.length >= 15) && cleanText.length <= 160 && !cleanText.includes('?') && !cleanText.includes('¿')) {
      try {
        const actionability = await classifyTaskActionability(cleanText);
        const minConfidence = HAS_ACTION_VERB ? 0.70 : 0.85;
        if (actionability.isActionable && actionability.confidence >= minConfidence) {
          console.log(`⚡ [SISTEMA 1 - LAYA] Tarea detectada por fallback (${(actionability.confidence * 100).toFixed(1)}%): "${cleanText}"`);
          const taskTitle = cleanText;
          const pilar = await resolveLifePilar(cleanText);
          const materia = resolveMateria(cleanText);
          const projects = await notionActions.getActiveProjects();
          const matchedProj = matchExistingProject(cleanText, projects);

          if (isSelf) {
            const createdTask = await notionActions.createTask(taskTitle, {
              pilarId: pilar.id,
              materiaId: materia ? materia.id : undefined,
              projectId: matchedProj ? matchedProj.id : undefined
            });

            if (createdTask && createdTask.id) {
              this.lastCreatedTaskId = createdTask.id;
              this.lastCreatedTaskTitle = taskTitle;
              this.lastCreatedTaskTimestamp = Date.now();
            }

            let destInfo = pilar.name;
            if (matchedProj) destInfo += ` • ${matchedProj.name}`;
            if (materia) destInfo += ` • ${materia.name}`;

            return {
              action: 'task',
              title: taskTitle,
              autoCreated: true,
              message: `Anoté la tarea: *${taskTitle}* (${destInfo}) :3`
            };
          } else {
            return {
              action: 'task_proposal',
              title: taskTitle,
              pilar: pilar.name,
              project: matchedProj ? matchedProj.name : (materia ? materia.name : null),
              autoCreated: false
            };
          }
        }
      } catch (err) {
        // Silencioso
      }
    }

    return null;
  }
}

const defaultInstance = new PassiveExtractor();
defaultInstance.PassiveExtractor = PassiveExtractor;
defaultInstance.extractDateTime = extractDateTime;
defaultInstance.TRANSACTION_PATTERNS = TRANSACTION_PATTERNS;
defaultInstance.TASK_PATTERNS = TASK_PATTERNS;
defaultInstance.DATE_PLANNING_PATTERNS = DATE_PLANNING_PATTERNS;
defaultInstance.REMINDER_PATTERNS = REMINDER_PATTERNS;
defaultInstance.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
defaultInstance.MATERIAS_VOCABULARY = MATERIAS_VOCABULARY;
defaultInstance.LIFE_PILARS_VOCABULARY = LIFE_PILARS_VOCABULARY;
defaultInstance.matchExistingProject = matchExistingProject;
defaultInstance.CONVERSATIONAL_OR_LOCATION_REGEX = CONVERSATIONAL_OR_LOCATION_REGEX;
module.exports = defaultInstance;
