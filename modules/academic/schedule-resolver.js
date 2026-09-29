/**
 * modules/academic/schedule-resolver.js
 * Responsabilidad única: Determinar y mapear las materias activas del semestre 2026B
 * según el horario oficial de CUCEA y la hora actual en Guadalajara (ZMG).
 */

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

class ScheduleResolver {
  resolveSubject(requestedText = '') {
    const clean = (requestedText || '').toLowerCase().trim();

    // 1. Coincidencia explícita solicitada por el usuario
    if (clean) {
      for (const [id, meta] of Object.entries(MATERIAS_MAP)) {
        if (clean.includes(meta.name.toLowerCase())) {
          return { id, ...meta, isFromSchedule: false };
        }
        for (const alias of meta.aliases) {
          if (clean.includes(alias)) {
            return { id, ...meta, isFromSchedule: false };
          }
        }
      }
    }

    // 2. Auto-resolución según horario oficial de CUCEA (CDMX / ZMG)
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const h = parseInt(parts.find(p => p.type === 'hour')?.value || '12', 10);
    const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const currentMins = h * 60 + m;

    const dayOfWeek = now.getDay();
    const todayClasses = WEEKLY_SCHEDULE[dayOfWeek] || [];

    for (const slot of todayClasses) {
      const [sh, sm] = slot.start.split(':').map(Number);
      const [eh, em] = slot.end.split(':').map(Number);
      const startMins = sh * 60 + sm;
      const endMins = eh * 60 + em;

      // Si estamos dentro del bloque o hasta 35 min antes
      if (currentMins >= (startMins - 35) && currentMins <= endMins) {
        const meta = MATERIAS_MAP[slot.id];
        return { id: slot.id, ...meta, isFromSchedule: true, slot };
      }
    }

    return null;
  }

  /**
   * Obtiene la próxima clase que comenzará dentro de una ventana de tiempo [minMins, maxMins]
   * Útil para avisos predictivos de salida a CUCEA (ej. 40-55 minutos antes).
   */
  getUpcomingClassSlot(minMinsAhead = 35, maxMinsAhead = 55) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Mexico_City',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    });
    const parts = formatter.formatToParts(now);
    const h = parseInt(parts.find(p => p.type === 'hour')?.value || '12', 10);
    const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
    const currentMins = h * 60 + m;

    const dayOfWeek = now.getDay();
    const todayClasses = WEEKLY_SCHEDULE[dayOfWeek] || [];

    for (const slot of todayClasses) {
      const [sh, sm] = slot.start.split(':').map(Number);
      const startMins = sh * 60 + sm;
      const diffMins = startMins - currentMins;

      if (diffMins >= minMinsAhead && diffMins <= maxMinsAhead) {
        const meta = MATERIAS_MAP[slot.id];
        return {
          id: slot.id,
          ...meta,
          slot,
          diffMins,
          startTime: slot.start,
          endTime: slot.end
        };
      }
    }

    return null;
  }
}

module.exports = new ScheduleResolver();

