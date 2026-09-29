const { notionRequest } = require('./notion-queue.js');
const { DATABASES } = require('./config/notion-schemas.js');
const { classifyExpenseCategory } = require('./system-one-client.js');

const CATEGORY_NAMES = {
  '3e6853a1-d77e-81e9-be73-f6a732b6831f': 'Salidas & Citas',
  '3e6853a1-d77e-812b-901b-d355d84881b8': 'Suscripciones',
  '3e6853a1-d77e-8189-ad16-e316489b7003': 'Servicios Hogar',
  '3e6853a1-d77e-8178-877f-c90a70ed89f2': 'Internet & Celular',
  '265853a1-d77e-80b2-89b6-ec9f43ed090d': 'Renta'
};

async function inferCategoryFromConcept(concept) {
  try {
    const layaCat = await classifyExpenseCategory(concept);
    if (layaCat === 'salidas') return 'Salidas & Citas';
    if (layaCat === 'suscripciones') return 'Suscripciones';
    if (layaCat === 'servicios_hogar') return 'Servicios Hogar';
    if (layaCat === 'internet_celular') return 'Internet & Celular';
    if (layaCat === 'renta') return 'Renta';
  } catch {}
  return 'Gastos Generales';
}

class FinanceReport {
  async fetchTransactionsBetween(startDateStr, endDateStr) {
    const res = await notionRequest(`/databases/${DATABASES.TRANSACCIONES}/query`, 'POST', {
      filter: {
        and: [
          { property: 'Tipo', select: { equals: 'Gasto' } },
          { property: 'Fecha', date: { on_or_after: startDateStr } },
          { property: 'Fecha', date: { on_or_before: endDateStr } }
        ]
      },
      sorts: [
        { property: 'Fecha', direction: 'descending' }
      ],
      page_size: 100
    });
    return res?.results || [];
  }

  async generateWeeklyReport() {
    const now = new Date();
    // Fechas semana actual (últimos 7 días)
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startThisWeek = d7.toISOString().split('T')[0];
    const endThisWeek = now.toISOString().split('T')[0];

    // Fechas semana previa (días -14 a -7)
    const d14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const startPrevWeek = d14.toISOString().split('T')[0];
    const endPrevWeek = startThisWeek;

    const [thisWeekRows, prevWeekRows] = await Promise.all([
      this.fetchTransactionsBetween(startThisWeek, endThisWeek),
      this.fetchTransactionsBetween(startPrevWeek, endPrevWeek)
    ]);

    let totalThisWeek = 0;
    const categoryTotals = {};
    const pendingAmountItems = [];
    const validTransactions = [];

    for (const p of thisWeekRows) {
      const concept = p.properties['Concepto']?.title?.[0]?.plain_text || 'Sin concepto';
      const amount = p.properties['Monto']?.number ?? 0;
      const catRelId = p.properties['Categoría']?.relation?.[0]?.id;

      let catName = catRelId && CATEGORY_NAMES[catRelId] ? CATEGORY_NAMES[catRelId] : await inferCategoryFromConcept(concept);

      if (amount > 0) {
        totalThisWeek += amount;
        categoryTotals[catName] = (categoryTotals[catName] || 0) + amount;
        validTransactions.push({ concept, amount, catName });
      } else {
        pendingAmountItems.push(concept);
      }
    }

    let totalPrevWeek = 0;
    for (const p of prevWeekRows) {
      const amount = p.properties['Monto']?.number ?? 0;
      if (amount > 0) totalPrevWeek += amount;
    }

    // Calcular variación porcentual
    let diffStr = '';
    if (totalPrevWeek > 0) {
      const diffPct = Math.round(((totalThisWeek - totalPrevWeek) / totalPrevWeek) * 100);
      if (diffPct > 0) {
        diffStr = `📈 *+${diffPct}%* vs la semana pasada ($${totalPrevWeek.toLocaleString('es-MX')} MXN)`;
      } else if (diffPct < 0) {
        diffStr = `📉 *${diffPct}%* vs la semana pasada ($${totalPrevWeek.toLocaleString('es-MX')} MXN)`;
      } else {
        diffStr = `⚖️ Igual que la semana pasada ($${totalPrevWeek.toLocaleString('es-MX')} MXN)`;
      }
    } else {
      diffStr = `📊 Primer ciclo registrado formalmente`;
    }

    // Ordenar categorías de mayor a menor
    const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

    // Top 3 gastos
    validTransactions.sort((a, b) => b.amount - a.amount);
    const top3 = validTransactions.slice(0, 3);

    // Formatear mensaje para WhatsApp
    let msg = `💰 *BALANCÍN FINANCIERO SEMANAL*\n`;
    msg += `📅 *Periodo:* ${startThisWeek} al ${endThisWeek}\n\n`;
    msg += `💵 *Total Gastado:* *$${totalThisWeek.toLocaleString('es-MX')} MXN*\n`;
    msg += `${diffStr}\n\n`;

    if (sortedCategories.length > 0) {
      msg += `📂 *Desglose por Categoría:*\n`;
      for (const [cat, sum] of sortedCategories) {
        const pct = Math.round((sum / (totalThisWeek || 1)) * 100);
        msg += `• *${cat}:* $${sum.toLocaleString('es-MX')} MXN (${pct}%)\n`;
      }
      msg += `\n`;
    }

    if (top3.length > 0) {
      msg += `🏆 *Mayores Gastos:*\n`;
      for (const t of top3) {
        msg += `• $${t.amount.toLocaleString('es-MX')} MXN - *${t.concept}*\n`;
      }
      msg += `\n`;
    }

    if (pendingAmountItems.length > 0) {
      msg += `⚠️ *Gastos pendientes de monto:* (${pendingAmountItems.length})\n`;
      for (const item of pendingAmountItems.slice(0, 4)) {
        msg += `• _${item}_\n`;
      }
      msg += `_(Si quieres asignarles monto, dime ej: "$80 en ${pendingAmountItems[0]}")_\n\n`;
    }

    msg += `_Seguimiento en vivo desde tu Second Brain en Notion ➔ Transacciones_ :3`;

    return {
      totalThisWeek,
      totalPrevWeek,
      categoryTotals,
      pendingCount: pendingAmountItems.length,
      message: msg
    };
  }
}

module.exports = new FinanceReport();
