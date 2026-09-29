const { exec } = require('child_process');
const taskRepository = require('./repositories/task-repository.js');
const mcpClient = require('./mcp-client.js');
const { MY_PHONE_JID } = require('./config/env.js');

/**
 * reminder-scheduler.js
 * Orquestador ligero de recordatorios de Notion.
 * Ahora desacoplado mediante TaskRepository (SOLID - SRP & DIP).
 */
class ReminderScheduler {
  constructor(customNotify = null) {
    this.customNotify = customNotify;
    this.timer = null;
    this.syncTimer = null;
  }

  async checkDueReminders() {
    try {
      const now = new Date();
      const nowMs = now.getTime();

      // Lectura rápida desde el repositorio (0ms, caché local SQLite)
      const cachedTasks = taskRepository.getCachedTasks();
      const dispatchedList = [];

      for (const task of cachedTasks) {
        const taskId = task.task_id;
        if (taskRepository.isDispatched(taskId)) continue;

        const dueDateStr = task.due_date;
        const dueTimestamp = new Date(dueDateStr).getTime();
        if (isNaN(dueTimestamp)) continue;

        const diffMs = nowMs - dueTimestamp;
        // Si está en la ventana de notificación (-45s a +2h)
        if (diffMs >= -45000 && diffMs <= 2 * 60 * 60 * 1000) {
          const title = task.title;
          const timeFmt = new Date(dueDateStr).toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Mexico_City'
          });

          // 1. WhatsApp
          const notifyMsg = `Oye Angel, acuérdate de esto: *${title}* (a las ${timeFmt}). Si ya quedó lista me avisas y la marco en Notion :3`;
          if (this.customNotify) {
            await this.customNotify(MY_PHONE_JID, notifyMsg);
          } else {
            await mcpClient.sendMessage(MY_PHONE_JID, notifyMsg);
          }

          // 2. macOS notification
          const safeTitle = title.replace(/"/g, '\\"');
          exec(`osascript -e 'display notification "${safeTitle}" with title "Recordatorio" sound name "Glass"'`);

          // 3. Marcar como despachado
          taskRepository.markDispatched(taskId, title, dueDateStr);
          console.log(`⏰ [REMINDER DISPATCHED] Alerta disparada para "${title}" (${timeFmt})`);

          dispatchedList.push({ taskId, title, timeFmt });
        }
      }

      return dispatchedList;
    } catch (err) {
      console.error('[REMINDER SCHEDULER] Error verificando recordatorios:', err.message);
      return [];
    }
  }

  start(intervalMs = 60000) {
    if (this.timer) clearInterval(this.timer);
    if (this.syncTimer) clearInterval(this.syncTimer);

    console.log(`⏰ [REMINDER SCHEDULER] Motor activo de recordatorios iniciado (verificación local cada ${intervalMs / 1000}s, sync Notion cada 20m)`);

    // Sincronización inicial
    taskRepository.syncCacheFromNotion().then(() => {
      this.checkDueReminders();
    }).catch(() => {});

    // Chequeo en SQLite cada 60s
    this.timer = setInterval(() => this.checkDueReminders(), intervalMs);

    // Sync con Notion cada 20 minutos
    this.syncTimer = setInterval(() => {
      taskRepository.syncCacheFromNotion().catch(() => {});
    }, 20 * 60 * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    console.log('⏰ [REMINDER SCHEDULER] Motor detenido.');
  }
}

const defaultInstance = new ReminderScheduler();
defaultInstance.ReminderScheduler = ReminderScheduler;
module.exports = defaultInstance;
