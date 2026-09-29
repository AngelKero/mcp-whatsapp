const https = require('https');
const { sendMessage } = require('./mcp-client.js');
const secondBrainAuditor = require('./second-brain-auditor.js');
const { notionRequest } = require('./notion-queue.js');
const { DATABASES, LIFE_PILLARS } = require('./config/notion-schemas.js');
const { MY_PHONE_JID } = require('./config/env.js');

const TAREAS_DATABASE_ID = DATABASES.TAREAS;
const AVISOS_DATABASE_ID = DATABASES.AVISOS;
const TRANSACCIONES_DATABASE_ID = DATABASES.TRANSACCIONES;

// Mapeo de Materias activas para nombres y profesores
const MATERIAS_MAP = {
  '24a853a1-d77e-80ec-bf20-e4fe770d19b2': { name: 'Programación WEB', defaultAula: 'I204', prof: 'Raúl Armando González Fregoso' },
  '24a853a1-d77e-8025-9f0d-f27304f4840d': { name: 'Sistemas de Bases de Datos II', defaultAula: 'I203', prof: 'Martha Patricia Martínez Vargas' },
  '24a853a1-d77e-8056-b6cc-e40fe1c1cbfb': { name: 'Fundamentos de Redes', defaultAula: 'L202', prof: 'Javier Claustro Bobadilla' },
  '24a853a1-d77e-8088-8d79-efd519fb7db5': { name: 'Inteligencia de Negocios', defaultAula: 'L102', prof: 'Roberto Omar Rodríguez Guiza' },
  '24a853a1-d77e-80d3-8c05-e04170ebb809': { name: 'Ingeniería de Software', defaultAula: 'I204', prof: 'Héctor Alejandro Durán Limón' },
  '24a853a1-d77e-80be-9d0b-ffa2a40bb0dc': { name: 'Administración de Proyectos TI', defaultAula: 'I108', prof: 'Eduardo Daniel Muñoz Hernández' },
  '24a853a1-d77e-80c2-a2b1-eab3662e0fa3': { name: 'Gestión de Serv. y Proc. TI II', defaultAula: 'L204', prof: 'Jorge Enrique López Campos' },
  '24a853a1-d77e-806c-827e-f0418adc2d9c': { name: 'Big Data', defaultAula: 'L207', prof: 'Liliana Ibeth Barbosa Santillán' }
};

// Horario oficial del semestre 2026B (CUCEA - Lic. en TI)
const WEEKLY_SCHEDULE = {
  'lunes': [
    { name: 'Admin Proyectos de TI', hora: '14:00 – 15:59 hrs', aula: 'I108', prof: 'Eduardo Daniel Muñoz Hernández', materiaId: '24a853a1-d77e-80be-9d0b-ffa2a40bb0dc' },
    { name: 'Inteligencia de Negocios', hora: '18:00 – 19:59 hrs', aula: 'L102', prof: 'Roberto Omar Rodríguez Guiza', materiaId: '24a853a1-d77e-8088-8d79-efd519fb7db5' }
  ],
  'martes': [
    { name: 'Programación WEB', hora: '09:00 – 10:59 hrs', aula: 'I204', prof: 'Raúl Armando González Fregoso', materiaId: '24a853a1-d77e-80ec-bf20-e4fe770d19b2' },
    { name: 'Sistemas de Bases de Datos II', hora: '11:00 – 12:59 hrs', aula: 'I203', prof: 'Martha Patricia Martínez Vargas', materiaId: '24a853a1-d77e-8025-9f0d-f27304f4840d' },
    { name: 'Fundamentos de Redes', hora: '16:00 – 17:59 hrs', aula: 'L202', prof: 'Javier Claustro Bobadilla', materiaId: '24a853a1-d77e-8056-b6cc-e40fe1c1cbfb' },
    { name: 'Ingeniería de Software', hora: '18:00 – 19:59 hrs', aula: 'I204', prof: 'Héctor Alejandro Durán Limón', materiaId: '24a853a1-d77e-80d3-8c05-e04170ebb809' }
  ],
  'miercoles': [
    { name: 'Inteligencia de Negocios', hora: '18:00 – 19:59 hrs', aula: 'L102', prof: 'Roberto Omar Rodríguez Guiza', materiaId: '24a853a1-d77e-8088-8d79-efd519fb7db5' }
  ],
  'jueves': [
    { name: 'Programación WEB', hora: '09:00 – 10:59 hrs', aula: 'I204', prof: 'Raúl Armando González Fregoso', materiaId: '24a853a1-d77e-80ec-bf20-e4fe770d19b2' },
    { name: 'Sistemas de Bases de Datos II', hora: '11:00 – 12:59 hrs', aula: 'I203', prof: 'Martha Patricia Martínez Vargas', materiaId: '24a853a1-d77e-8025-9f0d-f27304f4840d' },
    { name: 'Fundamentos de Redes', hora: '16:00 – 17:59 hrs', aula: 'L202', prof: 'Javier Claustro Bobadilla', materiaId: '24a853a1-d77e-8056-b6cc-e40fe1c1cbfb' },
    { name: 'Ingeniería de Software', hora: '18:00 – 19:59 hrs', aula: 'I204', prof: 'Héctor Alejandro Durán Limón', materiaId: '24a853a1-d77e-80d3-8c05-e04170ebb809' }
  ],
  'viernes': [
    { name: 'Big Data', hora: '11:00 – 14:59 hrs', aula: 'L207', prof: 'Liliana Ibeth Barbosa Santillán', materiaId: '24a853a1-d77e-806c-827e-f0418adc2d9c' },
    { name: 'Gestión de Serv. y Proc. TI II', hora: '18:00 – 19:59 hrs', aula: 'L204', prof: 'Jorge Enrique López Campos', materiaId: '24a853a1-d77e-80c2-a2b1-eab3662e0fa3' }
  ],
  'sabado': [],
  'domingo': []
};

// Códigos climáticos WMO de Open-Meteo
const WMO_CODES = {
  0: { desc: 'Cielo despejado', emoji: '☀️' },
  1: { desc: 'Mayormente despejado', emoji: '🌤️' },
  2: { desc: 'Parcialmente nublado', emoji: '⛅' },
  3: { desc: 'Nublado', emoji: '☁️' },
  45: { desc: 'Niebla', emoji: '🌫️' },
  48: { desc: 'Niebla con escarcha', emoji: '🌫️' },
  51: { desc: 'Llovizna ligera', emoji: '🌦️' },
  53: { desc: 'Llovizna moderada', emoji: '🌦️' },
  55: { desc: 'Llovizna densa', emoji: '🌧️' },
  61: { desc: 'Lluvia ligera', emoji: '🌧️' },
  63: { desc: 'Lluvia moderada', emoji: '🌧️' },
  65: { desc: 'Lluvia intensa', emoji: '🌧️' },
  80: { desc: 'Chubascos ligeros', emoji: '🌧️' },
  81: { desc: 'Chubascos moderados', emoji: '🌧️' },
  82: { desc: 'Chubascos violentos', emoji: '⛈️' },
  95: { desc: 'Tormenta eléctrica', emoji: '⛈️' },
  96: { desc: 'Tormenta con granizo ligero', emoji: '⛈️' },
  99: { desc: 'Tormenta con granizo fuerte', emoji: '⛈️' }
};

/**
 * Consulta el clima en vivo para el Área Metropolitana de Guadalajara (Zapopan / CUCEA)
 */
function fetchWeather(lat = 20.7416, lon = -103.3804) {
  return new Promise((resolve) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FMexico_City&forecast_days=1`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const currentTemp = Math.round(json.current?.temperature_2m || 20);
          const wCode = json.current?.weather_code ?? 0;
          const wInfo = WMO_CODES[wCode] || { desc: 'Templado', emoji: '🌤️' };
          const minTemp = Math.round(json.daily?.temperature_2m_min?.[0] || 16);
          const maxTemp = Math.round(json.daily?.temperature_2m_max?.[0] || 28);
          const rainProb = json.daily?.precipitation_probability_max?.[0] || 0;

          resolve({
            temp: currentTemp,
            min: minTemp,
            max: maxTemp,
            desc: wInfo.desc,
            emoji: wInfo.emoji,
            rainProb: rainProb,
            hasRainAlert: rainProb >= 50
          });
        } catch {
          resolve({ temp: 22, min: 16, max: 28, desc: 'Templado', emoji: '🌤️', rainProb: 0, hasRainAlert: false });
        }
      });
    }).on('error', () => {
      resolve({ temp: 22, min: 16, max: 28, desc: 'Templado', emoji: '🌤️', rainProb: 0, hasRainAlert: false });
    });
  });
}

/**
 * Obtiene las clases de hoy según el día de la semana
 */
function getTodayClasses() {
  const now = new Date();
  const dayName = now.toLocaleDateString('es-MX', {
    weekday: 'long',
    timeZone: 'America/Mexico_City'
  }).toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // Quita acentos (miercoles, sabado)

  const isWeekend = dayName === 'sabado' || dayName === 'domingo';
  const classes = WEEKLY_SCHEDULE[dayName] || [];

  return {
    dayName: dayName,
    isWeekend: isWeekend,
    classes: classes
  };
}

/**
 * Consulta avisos y cancelaciones recientes de profesores en Notion
 */
async function getRecentClassAnnouncements() {
  try {
    const res = await notionRequest(`/databases/${AVISOS_DATABASE_ID}/query`, 'POST', {
      sorts: [{ property: 'Fecha', direction: 'descending' }],
      page_size: 15
    });

    const announcements = [];
    const now = Date.now();
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

    for (const row of res.results) {
      const fechaStr = row.properties.Fecha?.date?.start;
      const materiaId = row.properties.Materia?.relation?.[0]?.id;
      const tipo = row.properties.Tipo?.select?.name || 'Aviso';
      const text = row.properties.Aviso?.title?.[0]?.plain_text || '';

      if (fechaStr) {
        const itemDate = new Date(fechaStr).getTime();
        // Si el aviso es de los últimos 2 días o sin fecha específica:
        if (now - itemDate <= TWO_DAYS_MS) {
          announcements.push({
            materiaId,
            tipo,
            text,
            isCancellation: tipo.includes('No hay clase'),
            isVirtual: tipo.includes('virtual')
          });
        }
      }
    }
    return announcements;
  } catch (err) {
    console.error('[BRIEFING] Error consultando avisos de profesores:', err.message);
    return [];
  }
}

/**
 * Consulta todas las tareas pendientes agrupadas por Pilares de Vida
 */
async function getPendingTasksByPillar() {
  try {
    const res = await notionRequest(`/databases/${TAREAS_DATABASE_ID}/query`, 'POST', {
      filter: {
        and: [
          { property: 'Completado', checkbox: { equals: false } },
          { property: 'Estado', status: { does_not_equal: 'Hecho' } }
        ]
      },
      sorts: [{ property: 'Fecha limite', direction: 'ascending' }],
      page_size: 50
    });

    // Bucket inicial para cada pilar
    const byPillar = {
      universidad: { info: LIFE_PILLARS['249853a1-d77e-80d7-ad03-d7242c666254'], tasks: [] },
      trabajo: { info: LIFE_PILLARS['249853a1-d77e-80f9-ac05-f8b4b46c619c'], tasks: [] },
      personal: { info: LIFE_PILLARS['249853a1-d77e-809b-bd22-d1594343275d'], tasks: [] },
      profesional: { info: LIFE_PILLARS['249853a1-d77e-80b0-b667-d9bb9eeef7f4'], tasks: [] },
      finanzas: { info: LIFE_PILLARS['265853a1-d77e-8001-8f07-f4fc96d1a513'], tasks: [] },
      hobbies: { info: LIFE_PILLARS['249853a1-d77e-80d7-b24e-f2590a309575'], tasks: [] }
    };

    const todayIso = new Date().toISOString().split('T')[0];

    for (const page of res.results) {
      const title = page.properties.Tarea?.title?.[0]?.plain_text?.trim() || 'Sin título';
      const dueDate = page.properties['Fecha limite']?.date?.start;
      const priority = page.properties.Prioridad?.status?.name || 'Media';
      const materiaId = page.properties.Materia?.relation?.[0]?.id;
      const materiaName = MATERIAS_MAP[materiaId]?.name;
      const pilarId = page.properties['Life pilars']?.relation?.[0]?.id;

      // Determinar vencimiento
      let isDueToday = false;
      let isOverdue = false;
      if (dueDate) {
        const dueDayIso = dueDate.split('T')[0];
        if (dueDayIso === todayIso) isDueToday = true;
        else if (dueDayIso < todayIso) isOverdue = true;
      }

      const taskItem = {
        title,
        dueDate,
        priority,
        materiaName,
        isDueToday,
        isOverdue,
        hasTime: dueDate ? dueDate.includes('T') : false
      };

      // Asignar al pilar correspondiente
      const pilarObj = LIFE_PILLARS[pilarId];
      if (pilarObj && byPillar[pilarObj.key]) {
        byPillar[pilarObj.key].tasks.push(taskItem);
      } else {
        // Fallback a personal
        byPillar.personal.tasks.push(taskItem);
      }
    }

    return byPillar;
  } catch (err) {
    console.error('[BRIEFING] Error consultando tareas por pilar:', err.message);
    return {};
  }
}

/**
 * Consulta el gasto acumulado en los últimos 7 días
 */
async function getWeeklySpendingSummary() {
  try {
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const dateStr = sevenDaysAgo.toISOString().split('T')[0];

    const res = await notionRequest(`/databases/${TRANSACCIONES_DATABASE_ID}/query`, 'POST', {
      filter: {
        and: [
          { property: 'Fecha', date: { on_or_after: dateStr } },
          { property: 'Tipo', select: { equals: 'Gasto' } }
        ]
      },
      page_size: 100
    });

    let total = 0;
    for (const r of res.results) {
      const amount = r.properties.Monto?.number || 0;
      total += amount;
    }
    return total;
  } catch {
    return null;
  }
}

/**
 * Formatea una fecha u hora límite
 */
function formatDueDate(dueDateStr) {
  if (!dueDateStr) return '';
  const d = new Date(dueDateStr);
  const isTimeIncluded = dueDateStr.includes('T');
  if (isTimeIncluded) {
    return d.toLocaleTimeString('es-MX', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Mexico_City'
    }) + ' hrs';
  }
  return d.toLocaleDateString('es-MX', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/Mexico_City'
  });
}

/**
 * Ensambla el mensaje completo del Daily Briefing con estilo humanizado y conversacional
 */
function buildEnrichedMessage({ weather, schedule, announcements, tasksByPillar, weeklySpent, auditSummary }) {
  const now = new Date();
  const dateFormatted = now.toLocaleDateString('es-MX', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/Mexico_City'
  });
  const capitalizedDate = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);

  // Recolectar tareas urgentes (vencen hoy o atrasadas)
  const allUrgentTasks = [];
  let totalPendingCount = 0;
  for (const pilar of Object.values(tasksByPillar)) {
    if (!pilar.tasks) continue;
    totalPendingCount += pilar.tasks.length;
    for (const t of pilar.tasks) {
      if (t.isDueToday || t.isOverdue) {
        allUrgentTasks.push(t);
      }
    }
  }

  // 1. Saludo e introducción conversacional de la jornada (Humanizer)
  let msg = `*Qué onda Ángel, buen día :3*\nHoy es *${capitalizedDate}*.\n\n`;

  // Breve síntesis conversacional del día
  if (schedule.isWeekend) {
    msg += `Día libre de clases en CUCEA. En Zapopan andamos a ${weather.temp}°C con máxima de ${weather.max}°C (${weather.desc.toLowerCase()}). Buen momento para descansar, avanzar en código o salir con Polluela.\n\n`;
  } else if (schedule.classes.length > 0) {
    const primerClase = schedule.classes[0];
    const tieneCancelacion = announcements.some(a => a.isCancellation && schedule.classes.some(c => c.materiaId === a.materiaId));
    
    msg += `Hoy tocan *${schedule.classes.length} materias* en CUCEA. Arrancas a las ${primerClase.hora.split('–')[0].trim()} en el aula ${primerClase.aula} (${primerClase.name}). `;
    msg += `El clima en el campus está en ${weather.temp}°C (${weather.desc.toLowerCase()})${weather.hasRainAlert ? ', y ojo que pinta para lluvia' : ''}. `;
    if (tieneCancelacion) {
      msg += `⚠️ *Ojo:* Un profesor avisó de cancelación hoy (revisa abajo). `;
    }
    if (allUrgentTasks.length > 0) {
      msg += `En Notion tienes ${allUrgentTasks.length} pendiente${allUrgentTasks.length > 1 ? 's' : ''} que vencen hoy.\n\n`;
    } else {
      msg += `De entregas urgentes para hoy estás al corriente.\n\n`;
    }
  } else {
    msg += `Sin clases programadas para hoy según tu horario. El clima está en ${weather.temp}°C (${weather.desc.toLowerCase()}).\n\n`;
  }

  // 2. Horario escolar de CUCEA (si aplica)
  if (!schedule.isWeekend && schedule.classes.length > 0) {
    msg += `*Tu horario en CUCEA para hoy:*\n`;
    for (const c of schedule.classes) {
      const aviso = announcements.find(a => a.materiaId === c.materiaId);
      let statusPrefix = '';
      let noticeExtra = '';

      if (aviso) {
        if (aviso.isCancellation) {
          statusPrefix = '🛑 *[Cancelada por profe]* ';
          noticeExtra = `\n   📢 _"${aviso.text.slice(0, 85).trim()}..."_`;
        } else if (aviso.isVirtual) {
          statusPrefix = '💻 *[Sesión en Meet]* ';
          noticeExtra = `\n   📢 _"${aviso.text.slice(0, 85).trim()}..."_`;
        }
      }

      msg += `• ${statusPrefix}*${c.hora}* | *${c.name}*\n`;
      msg += `  Aula \`${c.aula}\` • ${c.prof}${noticeExtra}\n`;
    }
    msg += `\n`;
  }

  // 3. Tareas y Pendientes por Pilares de Vida
  if (totalPendingCount > 0) {
    msg += `*Pendientes clave en Notion:*\n`;
    let totalTasksShown = 0;

    for (const [key, pilarGroup] of Object.entries(tasksByPillar)) {
      const tasks = pilarGroup.tasks;
      if (!tasks || tasks.length === 0) continue;

      const urgentTasks = tasks.filter(t => t.isDueToday || t.isOverdue);
      let selectedTasks = [];

      if (urgentTasks.length > 0) {
        selectedTasks = urgentTasks.slice(0, 3);
      } else {
        const highPri = tasks.filter(t => t.priority === 'Alta');
        selectedTasks = highPri.length > 0 ? [highPri[0]] : [tasks[0]];
      }

      if (selectedTasks.length > 0) {
        msg += `\n${pilarGroup.info.emoji} *${pilarGroup.info.name}* _(${tasks.length}):_\n`;
        for (const t of selectedTasks) {
          totalTasksShown++;
          let tag = '';
          if (t.isOverdue) tag = ' ⚠️ *[Atrasada]*';
          else if (t.isDueToday) tag = ' ⏰ *[Vence hoy]*';

          const priEmoji = t.priority === 'Alta' ? '🔥' : (t.priority === 'Media' ? '⚡' : '📌');
          const dueText = t.dueDate ? ` _(${formatDueDate(t.dueDate)})_` : '';
          const matText = t.materiaName ? ` • ${t.materiaName}` : '';

          msg += `  ${priEmoji} ${t.title}${dueText}${matText}${tag}\n`;
        }
      }
    }
    msg += `\n`;
  } else {
    msg += `*Notion al día:* Sin pendientes registrados para hoy :)\n\n`;
  }

  // 4. Balancín financiero discreto (si hay gasto semanal)
  if (weeklySpent !== null && weeklySpent > 0) {
    msg += `💰 *Gasto semanal acumulado:* $${weeklySpent.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN\n`;
  }

  // 5. Salud del Second Brain (si hay auditoría reciente)
  if (auditSummary && auditSummary.healthScore !== undefined) {
    const score = auditSummary.healthScore;
    const emoji = score >= 70 ? '🟢' : score >= 50 ? '🟡' : '🔴';
    msg += `🧠 *Salud del Second Brain:* ${emoji} *${score}/100*`;
    if (auditSummary.recommendations && auditSummary.recommendations.length > 0) {
      const topRec = auditSummary.recommendations[0];
      const recText = typeof topRec === 'string' ? topRec : (topRec.action || topRec.text || JSON.stringify(topRec));
      msg += ` • _Tip: ${recText}_`;
    }
    msg += `\n`;
  }

  // Cierre natural y cercano
  msg += `\nQue tengas buena jornada. A darle con ritmo xd`;

  return msg;
}

/**
 * Función central: genera el Daily Briefing resolviendo todas las fuentes en paralelo
 */
async function generateBriefingMessage() {
  console.log('🔄 [DAILY BRIEFING] Ensamblando briefing ejecutivo enriquecido...');
  const [weather, announcements, tasksByPillar, weeklySpent] = await Promise.all([
    fetchWeather(),
    getRecentClassAnnouncements(),
    getPendingTasksByPillar(),
    getWeeklySpendingSummary()
  ]);

  const schedule = getTodayClasses();
  const auditSummary = secondBrainAuditor.getLatestAuditSummary();

  return buildEnrichedMessage({
    weather,
    schedule,
    announcements,
    tasksByPillar,
    weeklySpent,
    auditSummary
  });
}

/**
 * Envía el briefing directamente a WhatsApp
 */
async function sendMorningBriefing(targetJid = MY_PHONE_JID) {
  if (!targetJid) throw new Error('briefing sin destinatario (MY_PHONE_JID vacío)');
  const text = await generateBriefingMessage();
  console.log(`📤 Enviando Daily Briefing Enriquecido a ${targetJid}...`);
  const result = await sendMessage(targetJid, text);
  const deliveredId = result && (result.ID || result.id);
  if (!deliveredId) throw new Error('briefing sin ID de entrega del daemon');
  console.log(`✅ Daily Briefing enviado con éxito (id ${deliveredId}).`);
  return { success: true, result };
}

// Compatibilidad hacia atrás
async function getPendingTasks() {
  const byPillar = await getPendingTasksByPillar();
  const all = [];
  for (const group of Object.values(byPillar)) {
    all.push(...group.tasks);
  }
  return all;
}

function buildWhatsAppMessage(tasks) {
  return generateBriefingMessage();
}

if (require.main === module) {
  sendMorningBriefing()
    .then(r => {
      console.log('Ejecución terminada exitosamente.');
      process.exit(0);
    })
    .catch(err => {
      console.error('Error enviando briefing:', err);
      process.exit(1);
    });
}

module.exports = {
  generateBriefingMessage,
  sendMorningBriefing,
  fetchWeather,
  getTodayClasses,
  getRecentClassAnnouncements,
  getPendingTasksByPillar,
  getWeeklySpendingSummary,
  buildEnrichedMessage,
  // Compatibilidad
  getPendingTasks,
  buildWhatsAppMessage
};
