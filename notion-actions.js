const https = require('https');

const NOTION_TOKEN = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY || '';

const DATABASES = {
  TAREAS: '249853a1-d77e-80b3-9e5c-eca51f834edf',
  TRANSACCIONES: '3e6853a1-d77e-81c9-ab0e-d1e8b37a55b1',
  NOTAS: '249853a1-d77e-801f-807b-d397eefafcb9',
  PROYECTOS: '255853a1-d77e-8007-be4e-c78abeb94072',
  PILARS: '249853a1-d77e-80de-a3b5-fb92df684519',
  MATERIAS: '249853a1-d77e-80e9-927e-c58f8619f035',
  ACCOUNTS: '265853a1-d77e-80fd-991e-db75136f1596',
  CATEGORIES: '265853a1-d77e-806e-b528-f1551d9972f4'
};

const LIFE_PILARS = {
  'finanzas': '265853a1-d77e-8001-8f07-f4fc96d1a513',
  'secreto': '25d853a1-d77e-805a-8c7d-cef0a8d8f2f6',
  'hobbies': '249853a1-d77e-80d7-b24e-f2590a309575',
  'profesional': '249853a1-d77e-80b0-b667-d9bb9eeef7f4',
  'vida personal': '249853a1-d77e-809b-bd22-d1594343275d',
  'personal': '249853a1-d77e-809b-bd22-d1594343275d',
  'trabajo': '249853a1-d77e-80f9-ac05-f8b4b46c619c',
  'universidad': '249853a1-d77e-80d7-ad03-d7242c666254',
  'cucea': '249853a1-d77e-80d7-ad03-d7242c666254'
};

const MATERIAS = {
  'programacion web': '24a853a1-d77e-80ec-bf20-e4fe770d19b2',
  'web': '24a853a1-d77e-80ec-bf20-e4fe770d19b2',
  'bases de datos': '24a853a1-d77e-8025-9f0d-f27304f4840d',
  'base de datos': '24a853a1-d77e-8025-9f0d-f27304f4840d',
  'bd': '24a853a1-d77e-8025-9f0d-f27304f4840d',
  'redes': '24a853a1-d77e-8056-b6cc-e40fe1c1cbfb',
  'fundamentos de redes': '24a853a1-d77e-8056-b6cc-e40fe1c1cbfb',
  'inteligencia de negocios': '24a853a1-d77e-8088-8d79-efd519fb7db5',
  'bi': '24a853a1-d77e-8088-8d79-efd519fb7db5',
  'ingenieria de software': '24a853a1-d77e-80d3-8c05-e04170ebb809',
  'software': '24a853a1-d77e-80d3-8c05-e04170ebb809',
  'administracion de ti': '24a853a1-d77e-80be-9d0b-ffa2a40bb0dc',
  'gestion de ti': '24a853a1-d77e-80c2-a2b1-eab3662e0fa3',
  'gestion': '24a853a1-d77e-80c2-a2b1-eab3662e0fa3',
  'big data': '24a853a1-d77e-8035-965a-fa63d76378e9'
};

const { notionRequest } = require('./notion-queue.js');

/**
 * Busca proyectos activos para vincular
 */
async function getActiveProjects() {
  try {
    const res = await notionRequest(`/databases/${DATABASES.PROYECTOS}/query`, 'POST', {
      filter: {
        property: 'Estado',
        status: { does_not_equal: 'Hecho' }
      },
      page_size: 20
    });
    return res.results.map(p => ({
      id: p.id,
      name: p.properties.Nombre?.title?.[0]?.plain_text || 'Sin nombre',
      pilarId: p.properties.Pilar?.relation?.[0]?.id
    }));
  } catch (err) {
    console.error('Error obteniendo proyectos:', err.message);
    return [];
  }
}

/**
 * Crea una tarea en Notion
 */
async function createTask(title, options = {}) {
  const properties = {
    'Tarea': { title: [{ text: { content: title } }] },
    'Estado': { status: { name: options.status || 'No iniciado' } },
    'Prioridad': { status: { name: options.priority || 'Media' } }
  };

  if (options.dueDate) {
    properties['Fecha limite'] = { date: { start: options.dueDate } };
  }

  if (options.pilarId) {
    properties['Life pilars'] = { relation: [{ id: options.pilarId }] };
  }

  if (options.projectId) {
    properties['💼 Proyectos'] = { relation: [{ id: options.projectId }] };
  }

  if (options.materiaId) {
    properties['Materia'] = { relation: [{ id: options.materiaId }] };
  }

  if (options.description) {
    properties['Descripción'] = { rich_text: [{ text: { content: options.description } }] };
  }

  return await notionRequest('/pages', 'POST', {
    parent: { database_id: DATABASES.TAREAS },
    properties: properties
  });
}

/**
 * Registra una transacción en Notion
 */
async function createTransaction({ amount, concept, type = 'Gasto', date = null, categoryId = null, accountId = null }) {
  const properties = {
    'Concepto': { title: [{ text: { content: concept || 'Gasto registrado desde WhatsApp' } }] },
    'Monto': { number: parseFloat(amount) },
    'Tipo': { select: { name: type } },
    'Fecha': { date: { start: date || new Date().toISOString().split('T')[0] } }
  };

  if (categoryId) {
    properties['Categoría'] = { relation: [{ id: categoryId }] };
  }

  if (accountId) {
    properties['Cuenta'] = { relation: [{ id: accountId }] };
  }

  return await notionRequest('/pages', 'POST', {
    parent: { database_id: DATABASES.TRANSACCIONES },
    properties: properties
  });
}

/**
 * Crea una nota rápida en Notion
 */
async function createNote(title, content, options = {}) {
  const properties = {
    'Título': { title: [{ text: { content: title } }] },
    'Tipo': { select: { name: options.type || 'Quick note' } }
  };

  if (options.pilarId) {
    properties['🏢 Life pilars'] = { relation: [{ id: options.pilarId }] };
  }

  if (options.materiaId) {
    properties['Materia'] = { relation: [{ id: options.materiaId }] };
  }

  if (content) {
    properties['Resumen'] = { rich_text: [{ text: { content: content.slice(0, 300) } }] };
  }

  const children = [];
  if (content) {
    children.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ text: { content: content } }] }
    });
  }

  return await notionRequest('/pages', 'POST', {
    parent: { database_id: DATABASES.NOTAS },
    properties: properties,
    children: children.length > 0 ? children : undefined
  });
}

/**
 * Crea un proyecto en Notion
 */
async function createProject(name, pilarId, description = '') {
  const properties = {
    'Nombre': { title: [{ text: { content: name } }] },
    'Estado': { status: { name: 'Plan' } }
  };

  if (pilarId) {
    properties['Pilar'] = { relation: [{ id: pilarId }] };
  }

  return await notionRequest('/pages', 'POST', {
    parent: { database_id: DATABASES.PROYECTOS },
    properties: properties
  });
}

/**
 * Consulta de tareas pendientes
 */
async function getPendingTasks(limit = 10) {
  const res = await notionRequest(`/databases/${DATABASES.TAREAS}/query`, 'POST', {
    filter: {
      property: 'Estado',
      status: { does_not_equal: 'Hecho' }
    },
    sorts: [
      { property: 'Fecha limite', direction: 'ascending' }
    ],
    page_size: limit
  });

  return res.results.map(p => ({
    id: p.id,
    title: p.properties.Tarea?.title?.[0]?.plain_text || 'Sin título',
    dueDate: p.properties['Fecha limite']?.date?.start || 'Sin fecha',
    priority: p.properties.Prioridad?.status?.name || 'Media',
    project: p.properties['💼 Proyectos']?.relation?.[0]?.id || null,
    materia: p.properties.Materia?.relation?.[0]?.id || null
  }));
}

/**
 * Archiva / elimina una tarea o página en Notion
 */
async function archiveTask(pageId) {
  return await notionRequest(`/pages/${pageId}`, 'PATCH', {
    archived: true
  });
}

/**
 * Obtiene la última tarea creada en Notion (dentro de una ventana de minutos)
 */
async function getLatestTask(createdWithinMinutes = 30) {
  try {
    const res = await notionRequest(`/databases/${DATABASES.TAREAS}/query`, 'POST', {
      sorts: [
        { timestamp: 'created_time', direction: 'descending' }
      ],
      page_size: 1
    });
    if (res.results && res.results.length > 0) {
      const page = res.results[0];
      const createdTime = new Date(page.created_time).getTime();
      const now = Date.now();
      if (now - createdTime <= createdWithinMinutes * 60 * 1000) {
        return {
          id: page.id,
          title: page.properties.Tarea?.title?.[0]?.plain_text || 'Sin título',
          createdTime
        };
      }
    }
    return null;
  } catch (err) {
    console.error('Error buscando última tarea:', err.message);
    return null;
  }
}

module.exports = {
  DATABASES,
  LIFE_PILARS,
  MATERIAS,
  getActiveProjects,
  createTask,
  createTransaction,
  createNote,
  createProject,
  getPendingTasks,
  archiveTask,
  getLatestTask,
  notionRequest
};

