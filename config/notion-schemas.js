/**
 * config/notion-schemas.js
 * Centralización de UUIDs de bases de datos, pilares de vida y categorías de Notion.
 */

const DATABASES = {
  TAREAS: '249853a1-d77e-80b3-9e5c-eca51f834edf',
  PROYECTOS: '255853a1-d77e-8007-be4e-c78abeb94072',
  NOTAS: '249853a1-d77e-801f-807b-d397eefafcb9',
  MATERIAS: '249853a1-d77e-80e9-927e-c58f8619f035',
  TRANSACCIONES: '3e6853a1-d77e-81c9-ab0e-d1e8b37a55b1',
  AVISOS: '3e6853a1-d77e-8113-9305-fdfae4d5f721',
  PILARS: '249853a1-d77e-80de-a3b5-fb92df684519'
};

const LIFE_PILLARS = {
  UNIVERSIDAD: { id: '249853a1-d77e-80d7-ad03-d7242c666254', key: 'universidad', name: 'Universidad (CUCEA)', emoji: '🎓' },
  TRABAJO: { id: '249853a1-d77e-80f9-ac05-f8b4b46c619c', key: 'trabajo', name: 'Trabajo', emoji: '💼' },
  VIDA_PERSONAL: { id: '249853a1-d77e-809b-bd22-d1594343275d', key: 'personal', name: 'Vida Personal & Pareja', emoji: '🌟' },
  PROFESIONAL: { id: '249853a1-d77e-80b0-b667-d9bb9eeef7f4', key: 'profesional', name: 'Profesional & Portafolio', emoji: '💻' },
  FINANZAS: { id: '265853a1-d77e-8001-8f07-f4fc96d1a513', key: 'finanzas', name: 'Finanzas', emoji: '💰' },
  HOBBIES: { id: '249853a1-d77e-80d7-b24e-f2590a309575', key: 'hobbies', name: 'Hobbies & Deporte', emoji: '🏃' }
};

// Indexar también por UUID y por key para facilitar búsquedas dinámicas
for (const p of Object.values(LIFE_PILLARS)) {
  LIFE_PILLARS[p.id] = p;
  LIFE_PILLARS[p.key] = p;
}

const EXPENSE_CATEGORIES = {
  SALIDAS: { id: '3e6853a1-d77e-81e9-be73-f6a732b6831f', name: 'Salidas & Citas' },
  SUSCRIPCIONES: { id: '3e6853a1-d77e-812b-901b-d355d84881b8', name: 'Suscripciones' },
  SERVICIOS_HOGAR: { id: '3e6853a1-d77e-8189-ad16-e316489b7003', name: 'Servicios Hogar' },
  INTERNET_CELULAR: { id: '3e6853a1-d77e-8178-877f-c90a70ed89f2', name: 'Internet & Celular' },
  RENTA: { id: '265853a1-d77e-80b2-89b6-ec9f43ed090d', name: 'Renta' }
};

module.exports = {
  DATABASES,
  LIFE_PILLARS,
  EXPENSE_CATEGORIES
};
