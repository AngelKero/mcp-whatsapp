const { DatabaseSync } = require('node:sqlite');
const { notionRequest } = require('../notion-queue.js');
const { DATABASES } = require('../config/notion-schemas.js');
const { DB_PATHS } = require('../config/env.js');

/**
 * repositories/task-repository.js
 * Encapsula la persistencia y lectura de Tareas en Notion y Caché local SQLite.
 */
class TaskRepository {
  constructor() {
    this.db = new DatabaseSync(DB_PATHS.REMINDERS);
    this.initDb();
  }

  initDb() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dispatched_reminders (
        task_id TEXT PRIMARY KEY,
        title TEXT,
        due_date TEXT,
        dispatched_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS cached_due_tasks (
        task_id TEXT PRIMARY KEY,
        title TEXT,
        due_date TEXT,
        cached_at INTEGER
      );
    `);
  }

  isDispatched(taskId) {
    const row = this.db.prepare('SELECT task_id FROM dispatched_reminders WHERE task_id = ?').get(taskId);
    return !!row;
  }

  markDispatched(taskId, title, dueDate) {
    this.db.prepare(`
      INSERT INTO dispatched_reminders (task_id, title, due_date, dispatched_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET dispatched_at = excluded.dispatched_at
    `).run(taskId, title, dueDate, Date.now());
  }

  getCachedTasks() {
    try {
      return this.db.prepare('SELECT task_id, title, due_date FROM cached_due_tasks').all();
    } catch {
      return [];
    }
  }

  /**
   * Refresca la caché local SQLite desde Notion
   */
  async syncCacheFromNotion(hoursAhead = 24) {
    const now = new Date();
    const past2Hours = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    const futureLimit = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000).toISOString();

    const res = await notionRequest(`/databases/${DATABASES.TAREAS}/query`, 'POST', {
      filter: {
        and: [
          { property: 'Estado', status: { does_not_equal: 'Hecho' } },
          { property: 'Fecha limite', date: { on_or_before: futureLimit } },
          { property: 'Fecha limite', date: { on_or_after: past2Hours } }
        ]
      },
      sorts: [{ property: 'Fecha limite', direction: 'ascending' }],
      page_size: 50
    });

    if (!res || !res.results) return [];

    const insertStmt = this.db.prepare(`
      INSERT INTO cached_due_tasks (task_id, title, due_date, cached_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        title = excluded.title,
        due_date = excluded.due_date,
        cached_at = excluded.cached_at
    `);

    this.db.exec('DELETE FROM cached_due_tasks');
    const nowMs = Date.now();

    for (const page of res.results) {
      const taskId = page.id;
      const dueDateStr = page.properties['Fecha limite']?.date?.start;
      if (!dueDateStr || !dueDateStr.includes('T')) continue;

      const title = page.properties['Tarea']?.title?.[0]?.plain_text || 'Recordatorio pendiente';
      insertStmt.run(taskId, title, dueDateStr, nowMs);
    }

    return this.getCachedTasks();
  }

  /**
   * Crea una nueva tarea en Notion
   */
  async createTask(title, options = {}) {
    const properties = {
      'Tarea': { title: [{ text: { content: title } }] },
      'Estado': { status: { name: options.status || 'No iniciado' } },
      'Prioridad': { status: { name: options.priority || 'Media' } }
    };

    if (options.pilarId) {
      properties['Life pilars'] = { relation: [{ id: options.pilarId }] };
    }
    if (options.projectId) {
      properties['💼 Proyectos'] = { relation: [{ id: options.projectId }] };
    }
    if (options.materiaId) {
      properties['Materias'] = { relation: [{ id: options.materiaId }] };
    }
    if (options.dueDate) {
      properties['Fecha limite'] = { date: { start: options.dueDate } };
    }
    if (options.description) {
      properties['Descripción'] = { rich_text: [{ text: { content: options.description } }] };
    }

    return await notionRequest('/pages', 'POST', {
      parent: { database_id: DATABASES.TAREAS },
      properties
    });
  }
}

module.exports = new TaskRepository();
