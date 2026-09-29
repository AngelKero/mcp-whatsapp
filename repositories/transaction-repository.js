const { notionRequest } = require('../notion-queue.js');
const { DATABASES, EXPENSE_CATEGORIES } = require('../config/notion-schemas.js');

/**
 * repositories/transaction-repository.js
 * Encapsula la persistencia y lectura de transacciones/gastos en Notion.
 */
class TransactionRepository {
  /**
   * Registra una transacción o gasto
   */
  async createExpense({ amount, concept, type = 'Gasto', date, categoryId }) {
    const today = date || new Date().toISOString().split('T')[0];
    const finalCategory = categoryId || EXPENSE_CATEGORIES.SALIDAS.id;

    const properties = {
      'Concepto': { title: [{ text: { content: concept || 'Gasto registrado' } }] },
      'Monto': { number: amount || 0 },
      'Tipo': { select: { name: type } },
      'Fecha': { date: { start: today } },
      'Categoría': { relation: [{ id: finalCategory }] }
    };

    return await notionRequest('/pages', 'POST', {
      parent: { database_id: DATABASES.TRANSACCIONES },
      properties
    });
  }

  /**
   * Obtiene las transacciones de los últimos N días
   */
  async getRecentExpenses(days = 7) {
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const res = await notionRequest(`/databases/${DATABASES.TRANSACCIONES}/query`, 'POST', {
      filter: {
        and: [
          { property: 'Tipo', select: { equals: 'Gasto' } },
          { property: 'Fecha', date: { on_or_after: sinceDate } }
        ]
      },
      sorts: [{ property: 'Fecha', direction: 'descending' }],
      page_size: 100
    });

    return res?.results || [];
  }
}

module.exports = new TransactionRepository();
