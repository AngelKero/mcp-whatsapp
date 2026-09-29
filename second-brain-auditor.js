const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const { notionRequest } = require('./notion-queue.js');

const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY || '';
const DB_PATH = path.join(__dirname, 'store', 'audit-log.db');

const DATABASES = {
  TAREAS: '249853a1-d77e-80b3-9e5c-eca51f834edf',
  PROYECTOS: '255853a1-d77e-8007-be4e-c78abeb94072',
  NOTAS: '249853a1-d77e-801f-807b-d397eefafcb9',
  MATERIAS: '249853a1-d77e-80e9-927e-c58f8619f035',
  TRANSACCIONES: '3e6853a1-d77e-81c9-ab0e-d1e8b37a55b1',
  AVISOS: '3e6853a1-d77e-8113-9305-fdfae4d5f721'
};

const EXPORT_SCRIPT = path.resolve(process.env.HOME, '.gemini/config/scripts/export-notion-brain.js');
const GRAPH_BUILDER = path.resolve(process.env.HOME, '.gemini/config/scripts/build-second-brain-graph.py');
const PYTHON_BIN = path.resolve(process.env.HOME, '.local/share/uv/tools/graphifyy/bin/python');

class SecondBrainAuditor {
  constructor() {
    this.initDb();
  }

  initDb() {
    try {
      const db = new DatabaseSync(DB_PATH);
      db.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT,
          health_score INTEGER,
          overdue_count INTEGER,
          orphan_count INTEGER,
          stagnant_projects_count INTEGER,
          uncategorized_tx_count INTEGER,
          report_json TEXT
        );
      `);
      db.close();
    } catch (err) {
      console.error('[AUDITOR] Error inicializando audit-log.db:', err.message);
    }
  }

  /**
   * 1. Auditoría de Tareas (Atrasadas, Huérfanas y sin Proyecto)
   */
  async auditTasks() {
    try {
      const res = await notionRequest(`/databases/${DATABASES.TAREAS}/query`, 'POST', {
        filter: {
          and: [
            { property: 'Completado', checkbox: { equals: false } },
            { property: 'Estado', status: { does_not_equal: 'Hecho' } }
          ]
        },
        page_size: 100
      });

      const todayIso = new Date().toISOString().split('T')[0];
      const overdue = [];
      const orphans = [];
      const withoutProject = [];

      for (const page of res.results || []) {
        const title = page.properties.Tarea?.title?.[0]?.plain_text?.trim() || 'Sin título';
        const dueDate = page.properties['Fecha limite']?.date?.start;
        const pilars = page.properties['Life pilars']?.relation || [];
        const projects = page.properties['💼 Proyectos']?.relation || [];
        const priority = page.properties.Prioridad?.status?.name || 'Media';

        const item = { id: page.id, title, dueDate, priority, projectsCount: projects.length };

        if (dueDate && dueDate.split('T')[0] < todayIso) {
          overdue.push(item);
        }

        if (pilars.length === 0) {
          orphans.push(item);
        }

        if (projects.length === 0) {
          withoutProject.push(item);
        }
      }

      return { totalActive: res.results?.length || 0, overdue, orphans, withoutProject, allTasks: res.results || [] };
    } catch (err) {
      console.error('[AUDITOR] Error auditando tareas:', err.message);
      return { totalActive: 0, overdue: [], orphans: [], withoutProject: [], allTasks: [] };
    }
  }

  /**
   * 2. Auditoría de Proyectos (Estancados / Sin tareas activas)
   */
  async auditProjects(activeTasks = []) {
    try {
      const res = await notionRequest(`/databases/${DATABASES.PROYECTOS}/query`, 'POST', {
        filter: {
          property: 'Estado',
          status: { does_not_equal: 'Hecho' }
        },
        page_size: 50
      });

      const stagnant = [];
      const active = [];

      // Mapeo de proyectos con tareas activas
      const projectTaskCount = {};
      for (const t of activeTasks || []) {
        const projs = t.properties?.['💼 Proyectos']?.relation || [];
        for (const p of projs) {
          projectTaskCount[p.id] = (projectTaskCount[p.id] || 0) + 1;
        }
      }

      for (const page of res.results || []) {
        const name = page.properties.Nombre?.title?.[0]?.plain_text?.trim() || 'Sin nombre';
        const tasks = page.properties['📝 Tareas']?.relation || [];
        const activeCount = tasks.length + (projectTaskCount[page.id] || 0);
        const lastEdited = page.last_edited_time;

        const isStagnant = activeCount === 0;
        const item = { id: page.id, name, tasksCount: activeCount, lastEdited };

        if (isStagnant) {
          stagnant.push(item);
        } else {
          active.push(item);
        }
      }


      return { totalActive: res.results?.length || 0, stagnant, active };
    } catch (err) {
      console.error('[AUDITOR] Error auditando proyectos:', err.message);
      return { totalActive: 0, stagnant: [], active: [] };
    }
  }

  /**
   * 3. Auditoría de Finanzas (Transacciones sin Categoría o sin Monto)
   */
  async auditFinances() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const res = await notionRequest(`/databases/${DATABASES.TRANSACCIONES}/query`, 'POST', {
        filter: {
          property: 'Fecha',
          date: { on_or_after: thirtyDaysAgo }
        },
        page_size: 100
      });

      const uncategorized = [];
      const zeroAmount = [];

      for (const page of res.results || []) {
        const concept = page.properties.Concepto?.title?.[0]?.plain_text || 'Transacción';
        const amount = page.properties.Monto?.number;
        const cat = page.properties['Categoría']?.relation || [];
        const date = page.properties.Fecha?.date?.start;

        const item = { id: page.id, concept, amount, date };

        if (cat.length === 0) {
          uncategorized.push(item);
        }

        if (amount === null || amount === undefined || amount === 0) {
          zeroAmount.push(item);
        }
      }

      return { totalChecked: res.results?.length || 0, uncategorized, zeroAmount };
    } catch (err) {
      console.error('[AUDITOR] Error auditando finanzas:', err.message);
      return { totalChecked: 0, uncategorized: [], zeroAmount: [] };
    }
  }

  /**
   * 4. Auditoría de Notas (Notas rápidas sueltas sin clasificar)
   */
  async auditNotes() {
    try {
      const res = await notionRequest(`/databases/${DATABASES.NOTAS}/query`, 'POST', {
        page_size: 50
      });

      const unclassified = [];
      for (const page of res.results || []) {
        const title = page.properties['Título']?.title?.[0]?.plain_text || 'Nota';
        const pilars = page.properties['🏢 Life pilars']?.relation || [];
        const materia = page.properties['Materia']?.relation || [];
        const tipo = page.properties['Tipo']?.select?.name || 'Quick note';

        if (tipo === 'Quick note' && pilars.length === 0 && materia.length === 0) {
          unclassified.push({ id: page.id, title });
        }
      }

      return { totalNotes: res.results?.length || 0, unclassified };
    } catch (err) {
      console.error('[AUDITOR] Error auditando notas:', err.message);
      return { totalNotes: 0, unclassified: [] };
    }
  }

  /**
   * 5. Cálculo cuantitativo de Salud del Second Brain (0 a 100%)
   */
  calculateHealthScore(taskAudit, projectAudit, financeAudit, noteAudit) {
    let score = 100;
    // Penalizaciones equilibradas
    score -= taskAudit.overdue.length * 1.5;
    score -= taskAudit.orphans.length * 2.5;
    score -= projectAudit.stagnant.length * 3.0;
    score -= financeAudit.uncategorized.length * 2.0;
    score -= financeAudit.zeroAmount.length * 1.0;
    score -= noteAudit.unclassified.length * 1.5;

    return Math.max(10, Math.min(100, Math.round(score)));
  }

  /**
   * 6. Generador de Recomendaciones Proactivas
   */
  generateRecommendations(taskAudit, projectAudit, financeAudit, noteAudit, score) {
    const recs = [];

    // Rec 1: Tareas atrasadas
    if (taskAudit.overdue.length > 0) {
      const sample = taskAudit.overdue.slice(0, 2).map(t => `"${t.title}"`).join(', ');
      recs.push(
        `🧹 *Higiene de Tareas:* Hay ${taskAudit.overdue.length} tarea${taskAudit.overdue.length > 1 ? 's' : ''} atrasada${taskAudit.overdue.length > 1 ? 's' : ''} (ej: ${sample}). Conviene reprogramarlas para esta semana o marcarlas como completadas si ya se hicieron.`
      );
    }

    // Rec 2: Proyectos estancados
    if (projectAudit.stagnant.length > 0) {
      const projName = projectAudit.stagnant[0].name;
      recs.push(
        `🚀 *Impulso de Proyectos:* El proyecto *"${projName}"* no tiene tareas activas asignadas. Te recomiendo definir el próximo hito accionable o marcarlo como "Hecho" si ya concluyó.`
      );
    }

    // Rec 3: Tareas huérfanas
    if (taskAudit.orphans.length > 0) {
      recs.push(
        `📂 *Estructura:* Detecté ${taskAudit.orphans.length} tarea${taskAudit.orphans.length > 1 ? 's' : ''} sin Pilar de Vida asignado. Asignarles pilar permite que aparezcan en tu Daily Briefing diario.`
      );
    }

    // Rec 4: Transacciones sin categorizar
    if (financeAudit.uncategorized.length > 0) {
      recs.push(
        `💳 *Finanzas:* Hay ${financeAudit.uncategorized.length} gasto${financeAudit.uncategorized.length > 1 ? 's' : ''} sin categoría en Transacciones. Asignarles categoría mantiene exactos tus balances semanales.`
      );
    }

    // Rec 5: Notas en inbox
    if (noteAudit.unclassified.length > 0) {
      recs.push(
        `📝 *Notas Sueltas:* Tienes ${noteAudit.unclassified.length} apunte${noteAudit.unclassified.length > 1 ? 's' : ''} en el inbox sin vincular a una Materia o Pilar.`
      );
    }

    // Si todo está perfecto
    if (recs.length === 0) {
      recs.push('✨ ¡Tu Second Brain está impecable! Todas tus tareas, finanzas y notas tienen estructura y relaciones activas.');
    }

    return recs.slice(0, 4);
  }

  /**
   * 7. Regeneración del Grafo de Conocimiento Graphify
   */
  async regenerateKnowledgeGraph() {
    try {
      console.log('🔄 [GRAPHIFY] Exportando cambios de Notion a Markdown...');
      execSync(`node "${EXPORT_SCRIPT}"`, { encoding: 'utf-8', timeout: 60000 });

      console.log('🔄 [GRAPHIFY] Re-construyendo grafo de conocimiento...');
      const graphOut = execSync(`"${PYTHON_BIN}" "${GRAPH_BUILDER}"`, {
        encoding: 'utf-8',
        timeout: 30000
      });

      const parsed = JSON.parse(graphOut.trim().split('\n').pop());
      return parsed;
    } catch (err) {
      console.error('[AUDITOR] Error regenerando grafo Graphify:', err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Guarda el reporte en SQLite para persistencia histórica
   */
  persistAudit(report) {
    try {
      const db = new DatabaseSync(DB_PATH);
      const stmt = db.prepare(`
        INSERT INTO audit_logs (
          timestamp, health_score, overdue_count, orphan_count,
          stagnant_projects_count, uncategorized_tx_count, report_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        report.timestamp,
        report.healthScore,
        report.diagnostics.overdueTasksCount,
        report.diagnostics.orphanTasksCount,
        report.diagnostics.stagnantProjectsCount,
        report.diagnostics.uncategorizedTxCount,
        JSON.stringify(report)
      );
      // Mantenimiento preventivo WAL para evitar crecimiento excesivo del archivo log
      try {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch {}
      db.close();

      // Checkpoint también en messages.db del bot de WhatsApp
      try {
        const msgDbPath = path.join(__dirname, 'store', 'messages.db');
        const mDb = new DatabaseSync(msgDbPath);
        mDb.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        mDb.close();
      } catch {}
    } catch (err) {
      console.error('[AUDITOR] Error guardando log en SQLite:', err.message);
    }
  }

  /**
   * Obtiene el último reporte de auditoría guardado (para el Daily Briefing)
   */
  getLatestAuditSummary() {
    try {
      const db = new DatabaseSync(DB_PATH, { readOnly: true });
      const row = db.prepare('SELECT report_json FROM audit_logs ORDER BY id DESC LIMIT 1').get();
      db.close();
      if (row && row.report_json) {
        return JSON.parse(row.report_json);
      }
    } catch {}
    return null;
  }

  /**
   * Formatea el mensaje para WhatsApp
   */
  formatReportMessage({ score, taskAudit, projectAudit, financeAudit, noteAudit, recommendations, graphResult }) {
    let scoreEmoji = '🟢';
    let statusText = 'Excelente';
    if (score < 70) {
      scoreEmoji = '🟡';
      statusText = 'Mejorable';
    }
    if (score < 50) {
      scoreEmoji = '🔴';
      statusText = 'Atención requerida';
    }

    let msg = `🩺 *AUDITORÍA & SALUD DEL SECOND BRAIN*\n`;
    msg += `─────────────────────────\n`;
    msg += `📊 *Índice de Salud:* ${scoreEmoji} *${score}/100* (${statusText})\n\n`;

    msg += `🔍 *Diagnóstico de Integridad:*\n`;
    msg += `• ⚠️ *Tareas atrasadas:* ${taskAudit.overdue.length} pendientes\n`;
    msg += `• 📂 *Tareas huérfanas (sin pilar):* ${taskAudit.orphans.length}\n`;
    msg += `• 📁 *Proyectos estancados (sin tareas):* ${projectAudit.stagnant.length}\n`;
    msg += `• 💳 *Gastos sin categorizar:* ${financeAudit.uncategorized.length}\n`;
    msg += `• 📝 *Notas sueltas en inbox:* ${noteAudit.unclassified.length}\n\n`;

    msg += `💡 *RECOMENDACIONES PROACTIVAS:*\n`;
    for (let i = 0; i < recommendations.length; i++) {
      msg += `${i + 1}. ${recommendations[i]}\n`;
    }

    if (graphResult && graphResult.success) {
      msg += `\n🧠 *GRAFO GRAPHIFY ACTUALIZADO:*\n`;
      msg += `• *Nodos:* ${graphResult.nodes.toLocaleString()} · *Relaciones:* ${graphResult.edges.toLocaleString()}\n`;
      msg += `• *Comunidades Louvain:* ${graphResult.communities}\n`;
      if (graphResult.godNodes && graphResult.godNodes.length > 0) {
        msg += `• *Hub Central:* ${graphResult.godNodes[0]}\n`;
      }
      msg += `• ⚡ Sincronizado en ${graphResult.duration}s sin costo de API.\n`;
    }

    msg += `─────────────────────────\n`;
    msg += `✨ _Second Brain auditado y grafo regenerado con éxito :3_`;

    return msg;
  }

  /**
   * Ejecución completa: Auditoría + Recomendaciones + Grafo
   */
  async runFullAudit(regenerateGraph = true, isSilent = false) {
    console.log('🔍 [AUDITOR] Iniciando auditoría integral del Second Brain...');

    // Ejecutar diagnósticos en paralelo
    const [taskAudit, financeAudit, noteAudit] = await Promise.all([
      this.auditTasks(),
      this.auditFinances(),
      this.auditNotes()
    ]);

    const projectAudit = await this.auditProjects(taskAudit.allTasks);
    const score = this.calculateHealthScore(taskAudit, projectAudit, financeAudit, noteAudit);
    const recommendations = this.generateRecommendations(taskAudit, projectAudit, financeAudit, noteAudit, score);

    let graphResult = null;
    if (regenerateGraph) {
      graphResult = await this.regenerateKnowledgeGraph();
    }

    const timestamp = new Date().toISOString();
    const reportData = {
      timestamp,
      healthScore: score,
      diagnostics: {
        overdueTasksCount: taskAudit.overdue.length,
        orphanTasksCount: taskAudit.orphans.length,
        stagnantProjectsCount: projectAudit.stagnant.length,
        uncategorizedTxCount: financeAudit.uncategorized.length,
        unclassifiedNotesCount: noteAudit.unclassified.length
      },
      recommendations,
      graphResult
    };

    const whatsappMessage = this.formatReportMessage({
      score,
      taskAudit,
      projectAudit,
      financeAudit,
      noteAudit,
      recommendations,
      graphResult
    });

    reportData.whatsappMessage = whatsappMessage;

    // Persistir en SQLite
    this.persistAudit(reportData);

    console.log(`✅ [AUDITOR] Auditoría completada. Score: ${score}/100. Recomendaciones: ${recommendations.length}`);
    return reportData;
  }
}

module.exports = new SecondBrainAuditor();
