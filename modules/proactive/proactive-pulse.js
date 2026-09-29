const { exec } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { DB_PATHS, MY_PHONE_JID } = require('../../config/env.js');
const { sendMessage } = require('../../mcp-client.js');
const taskRepository = require('../../repositories/task-repository.js');
const scheduleResolver = require('../academic/schedule-resolver.js');
const { classifyLifePilar } = require('../../system-one-client.js');

/**
 * modules/proactive/proactive-pulse.js
 * Motor de Señales Predictivas y Latido Proactivo (Proactive Pulse).
 * 
 * Funcionalidades:
 * 1. Predictor de Entregas (Deadlines a 5h y 2h antes de vencer).
 * 2. Avisos de Salida hacia CUCEA (45m antes de clases del semestre 2026B).
 * 3. Monitor Proactivo de Batería de la MacBook Air M1 (<20% descargando).
 * 4. Idempotencia total respaldada en SQLite (dispatched_pulses).
 */
class ProactivePulseEngine {
  constructor(dbInstance = null) {
    this.db = dbInstance || new DatabaseSync(DB_PATHS.REMINDERS);
    this.initDb();
    this.isPulsing = false;
  }

  initDb() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dispatched_pulses (
        pulse_key TEXT PRIMARY KEY,
        category TEXT,
        payload TEXT,
        dispatched_at INTEGER
      );
    `);
  }

  isPulseDispatched(pulseKey) {
    try {
      const row = this.db.prepare('SELECT pulse_key FROM dispatched_pulses WHERE pulse_key = ?').get(pulseKey);
      return !!row;
    } catch {
      return false;
    }
  }

  markPulseDispatched(pulseKey, category, payload = '') {
    try {
      this.db.prepare(`
        INSERT INTO dispatched_pulses (pulse_key, category, payload, dispatched_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(pulse_key) DO UPDATE SET dispatched_at = excluded.dispatched_at
      `).run(pulseKey, category, payload, Date.now());
    } catch (err) {
      console.error('[PROACTIVE PULSE] Error guardando pulse en SQLite:', err.message);
    }
  }

  /**
   * Helper para notificar por WhatsApp y macOS (Display Notification)
   */
  async notify(title, message, sound = 'Glass') {
    try {
      // 1. WhatsApp
      await sendMessage(MY_PHONE_JID, message);

      // 2. macOS Notification
      const safeTitle = title.replace(/"/g, '\\"');
      const preview = message.split('\n')[0].replace(/"/g, '\\"');
      exec(`osascript -e 'display notification "${preview}" with title "${safeTitle}" sound name "${sound}"'`);
    } catch (err) {
      console.error('[PROACTIVE PULSE] Error enviando notificación:', err.message);
    }
  }

  /**
   * 1. Monitor Predictivo de Deadlines (Ventana de 5 horas y 2 horas)
   */
  async checkDeadlines() {
    try {
      const cachedTasks = taskRepository.getCachedTasks();
      const nowMs = Date.now();

      const candidates5h = [];
      const candidates2h = [];

      for (const task of cachedTasks) {
        const dueDate = new Date(task.due_date);
        const dueMs = dueDate.getTime();
        if (isNaN(dueMs)) continue;

        const diffMinutes = Math.round((dueMs - nowMs) / 60000);
        const timeFmt = dueDate.toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Mexico_City'
        });

        // Caso A: Alerta temprana de 5 horas (entre 4h 30m y 5h 30m)
        if (diffMinutes >= 270 && diffMinutes <= 330) {
          const pulseKey = `deadline:5h:${task.task_id}`;
          if (!this.isPulseDispatched(pulseKey)) {
            candidates5h.push({ task, timeFmt, pulseKey });
          }
        }

        // Caso B: Alerta crítica de 2 horas (entre 90m y 135m)
        if (diffMinutes >= 90 && diffMinutes <= 135) {
          const pulseKey = `deadline:2h:${task.task_id}`;
          if (!this.isPulseDispatched(pulseKey)) {
            candidates2h.push({ task, timeFmt, pulseKey });
          }
        }
      }

      // Despachar 5h (individual o consolidado)
      if (candidates5h.length === 1) {
        const { task, timeFmt, pulseKey } = candidates5h[0];
        const pilarKey = await classifyLifePilar(task.title);
        const isSchool = pilarKey === 'universidad';

        const contextTip = isSchool
          ? `Si todavía no la subes a plataforma, buen momento para darle una checada :3`
          : `Buen momento para irle avanzando :3`;

        const msg = `Oye Angel, para que lo tengas en el radar: te quedan unas 5 horas para *${task.title}* (límite: ${timeFmt}). ${contextTip}`;
        await this.notify('Pendiente en 5h', msg, 'Submarine');
        this.markPulseDispatched(pulseKey, 'deadline_5h', task.title);
        console.log(`[PROACTIVE PULSE] Alerta 5h enviada para "${task.title}"`);
      } else if (candidates5h.length > 1) {
        const items = candidates5h.map(c => `• *${c.task.title}* _(${c.timeFmt})_`).join('\n');
        const msg = `Oye Angel, traes estos ${candidates5h.length} pendientes para hoy en unas 5 horas:\n\n${items}\n\nPara que los tengas en el radar y no se te junten al rato :3`;
        await this.notify(`${candidates5h.length} pendientes en 5h`, msg, 'Submarine');
        for (const c of candidates5h) {
          this.markPulseDispatched(c.pulseKey, 'deadline_5h', c.task.title);
        }
        console.log(`[PROACTIVE PULSE] Alerta consolidada 5h enviada para ${candidates5h.length} tareas`);
      }

      // Despachar 2h (individual o consolidado)
      if (candidates2h.length === 1) {
        const { task, timeFmt, pulseKey } = candidates2h[0];
        const pilarKey = await classifyLifePilar(task.title);
        const isSchool = pilarKey === 'universidad';

        const contextTip = isSchool
          ? `Para que la tengas lista o subida a plataforma con tiempo xd`
          : `Para que no te agarren las prisas al rato :3`;

        const msg = `Ojo Angel, te quedan como 2 horas para la entrega de *${task.title}* (a las ${timeFmt}). ${contextTip}`;
        await this.notify('Entrega en 2h', msg, 'Ping');
        this.markPulseDispatched(pulseKey, 'deadline_2h', task.title);
        console.log(`[PROACTIVE PULSE] Alerta 2h enviada para "${task.title}"`);
      } else if (candidates2h.length > 1) {
        const items = candidates2h.map(c => `• *${c.task.title}* _(${c.timeFmt})_`).join('\n');
        const msg = `Ojo Angel, traes ${candidates2h.length} entregas que vencen en unas 2 horas:\n\n${items}\n\nPara que le metas turbo antes de que se te junte el jale :3`;
        await this.notify(`${candidates2h.length} Vencimientos críticos (2h)`, msg, 'Ping');
        for (const c of candidates2h) {
          this.markPulseDispatched(c.pulseKey, 'deadline_2h', c.task.title);
        }
        console.log(`[PROACTIVE PULSE] Alerta consolidada 2h enviada para ${candidates2h.length} tareas`);
      }
    } catch (err) {
      console.error('[PROACTIVE PULSE] Error en checkDeadlines:', err.message);
    }
  }

  /**
   * 2. Monitor de Salida hacia CUCEA (40 a 55 minutos antes)
   */
  async checkUpcomingClasses() {
    try {
      const now = new Date();
      const upcoming = scheduleResolver.getUpcomingClassSlot(35, 55);

      if (upcoming) {
        const todayStr = now.toISOString().slice(0, 10);
        const pulseKey = `class_leave:${todayStr}:${upcoming.id}`;

        if (!this.isPulseDispatched(pulseKey)) {
          const msg = `Oye Angel, ya casi es hora de jalar a CUCEA.\n\nEn unos ${upcoming.diffMins} minutos (${upcoming.startTime} hrs) te toca *${upcoming.name}* en el aula *${upcoming.aula}* con el profe ${upcoming.prof}.\n\nVete con tiempo para que alcances buen lugar y no te toque hasta atrás :3`;
          await this.notify('Salida a CUCEA', msg, 'Hero');
          this.markPulseDispatched(pulseKey, 'class_outing', upcoming.name);
          console.log(`[PROACTIVE PULSE] Aviso de salida a CUCEA enviado para "${upcoming.name}"`);
        }
      }
    } catch (err) {
      console.error('[PROACTIVE PULSE] Error en checkUpcomingClasses:', err.message);
    }
  }

  /**
   * 3. Monitor Proactivo de Batería de la MacBook Air M1
   */
  async checkBatteryHealth() {
    return new Promise((resolve) => {
      exec('pmset -g batt', async (error, stdout) => {
        if (error || !stdout) return resolve();

        try {
          const isDischarging = stdout.includes('discharging');
          const match = stdout.match(/(\d+)%/);
          if (!match) return resolve();

          const percentage = parseInt(match[1], 10);

          // Si está desconectada y la batería es <= 20%
          if (isDischarging && percentage <= 20) {
            const now = new Date();
            const hourSlot = now.getHours(); // Clave por hora para no spammear cada 30s
            const todayStr = now.toISOString().slice(0, 10);
            const pulseKey = `batt_low:${todayStr}:${hourSlot}:${Math.floor(percentage / 5)}`;

            if (!this.isPulseDispatched(pulseKey)) {
              const msg = `Oye, a tu MacBook Air ya le queda el *${percentage}%* de pila y está desconectada. Pégale el cargador para que no te deje colgado al rato xd :3`;
              await this.notify('Batería baja Mac', msg, 'Basso');
              this.markPulseDispatched(pulseKey, 'battery_low', `${percentage}%`);
              console.log(`[PROACTIVE PULSE] Alerta de batería enviada (${percentage}%)`);
            }
          }
          resolve();
        } catch (err) {
          console.error('[PROACTIVE PULSE] Error parseando batería:', err.message);
          resolve();
        }
      });
    });
  }

  /**
   * Ejecución principal del ciclo de latido (invocado periódicamente)
   */
  async pulse() {
    if (this.isPulsing) return;
    this.isPulsing = true;

    try {
      await this.checkDeadlines();
      await this.checkUpcomingClasses();
      await this.checkBatteryHealth();
    } catch (err) {
      console.error('[PROACTIVE PULSE] Error durante el latido:', err.message);
    } finally {
      this.isPulsing = false;
    }
  }
}

const defaultInstance = new ProactivePulseEngine();
defaultInstance.ProactivePulseEngine = ProactivePulseEngine;
module.exports = defaultInstance;
