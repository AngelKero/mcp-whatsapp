const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const passiveExtractor = require('../../passive-extractor.js');

describe('PassiveExtractor Unit Suite', () => {
  describe('extractDateTime()', () => {
    it('debe extraer horas en formato 12h AM/PM correctamente', () => {
      const resPm = passiveExtractor.extractDateTime('recordarme llamar al doctor a las 4:30 pm porfa');
      assert.equal(resPm.hasTime, true);
      assert.equal(resPm.hours, 16);
      assert.equal(resPm.minutes, 30);
      assert.equal(resPm.timeDisplay, '16:30 hrs');

      const resAm = passiveExtractor.extractDateTime('junta a las 9 am');
      assert.equal(resAm.hasTime, true);
      assert.equal(resAm.hours, 9);
      assert.equal(resAm.minutes, 0);
    });

    it('debe manejar shift de fecha para "mañana"', () => {
      const now = new Date();
      const res = passiveExtractor.extractDateTime('recordar mañana a las 10:00 hrs');
      assert.equal(res.hasTime, true);
      assert.equal(res.hours, 10);
      assert.equal(res.minutes, 0);

      const targetDate = new Date(res.isoWithOffset);
      // Debe ser el día siguiente (o dif > 12h)
      const diffHours = (targetDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      assert.ok(diffHours > 0, 'La fecha ISO debe ser futura');
    });

    it('debe limpiar modismos y muletillas (porfa, plis, xd, :3)', () => {
      const res = passiveExtractor.extractDateTime('comprar leche porfa xd :3');
      assert.ok(!res.cleanText.includes('porfa'));
      assert.ok(!res.cleanText.includes('xd'));
      assert.ok(!res.cleanText.includes(':3'));
    });
  });

  describe('TRANSACTION_PATTERNS & EXPENSE_CATEGORIES', () => {
    it('debe reconocer gastos explícitos con montos en pesos', () => {
      const testCases = [
        { text: 'gasté $120 en uber', expectedAmt: 120, expectedConcept: 'uber' },
        { text: 'pagué 45 pesos de estacionamiento', expectedAmt: 45, expectedConcept: 'estacionamiento' },
        { text: '300 varos de tacos', expectedAmt: 300, expectedConcept: 'tacos' },
        { text: 'nos costó $250 la comida', expectedAmt: 250, expectedConcept: 'la comida' },
        { text: '$50 en oxxo', expectedAmt: 50, expectedConcept: 'oxxo' }
      ];

      for (const tc of testCases) {
        let matched = false;
        for (const pat of passiveExtractor.TRANSACTION_PATTERNS) {
          const m = tc.text.match(pat);
          if (m) {
            matched = true;
            if (m[2] !== undefined) {
              const amt = parseFloat(m[1].replace(',', '.'));
              assert.equal(amt, tc.expectedAmt);
              assert.ok(m[2].toLowerCase().includes(tc.expectedConcept));
            }
            break;
          }
        }
        assert.ok(matched, `El texto "${tc.text}" debió coincidir con TRANSACTION_PATTERNS`);
      }
    });

    it('debe clasificar correctamente categorías semánticas de gasto', () => {
      const cat = passiveExtractor.EXPENSE_CATEGORIES;
      assert.ok(cat.comida.test('tacos al pastor'));
      assert.ok(cat.transporte.test('uber al cucea'));
      assert.ok(cat.servicios.test('pago de internet telmex'));
      assert.ok(cat.universidad.test('copias y credencial cucea'));
      assert.ok(cat.hobbies.test('estambre para amigurumi'));
    });
  });

  describe('TASK_PATTERNS & Compromisos', () => {
    it('debe detectar expresiones de tareas personales y pendientes', () => {
      const testCases = [
        'tengo que subir la práctica de redes',
        'debo entregar el reporte antes de las 11',
        'voy a comprar el estambre para el amigurumi',
        'se me olvidó sacar las copias del kardex',
        'tarea: terminar la api en express',
        '- [ ] configurar el webhook de stripe'
      ];

      for (const tc of testCases) {
        const matched = passiveExtractor.TASK_PATTERNS.some(pat => pat.test(tc));
        assert.ok(matched, `El texto "${tc}" debió coincidir con TASK_PATTERNS`);
      }
    });

    it('no debe detectar frases de descanso o sueño como tareas (mimir, dormir, descansar)', () => {
      const nonTaskCases = [
        'muchas gracias antigravity, ya me voy a mimir',
        'ya me voy a mimir',
        'voy a mimir',
        'voy a dormir',
        'voy a descansar',
        'mañana voy a mimir todo el día',
        'al rato voy a dormir',
        'llegando voy a dormir',
        'tengo que dormir temprano',
        'debo descansar'
      ];

      for (const tc of nonTaskCases) {
        const matched = passiveExtractor.TASK_PATTERNS.some(pat => pat.test(tc));
        assert.ok(!matched, `El texto "${tc}" NO debió coincidir con TASK_PATTERNS`);
      }
    });
  });

  describe('DATE_PLANNING_PATTERNS (Vida Personal)', () => {
    it('debe detectar planes de pareja y salidas', () => {
      const testCases = [
        'vamos a ir a la cineteca el fin de semana',
        'vamos a cenar unos tacos con Erika',
        'cita en galerías santa anita',
        'comprar los boletos para el cine'
      ];

      for (const tc of testCases) {
        const matched = passiveExtractor.DATE_PLANNING_PATTERNS.some(pat => pat.test(tc));
        assert.ok(matched, `El texto "${tc}" debió coincidir con DATE_PLANNING_PATTERNS`);
      }
    });

    it('no debe detectar planes técnicos, laborales o académicos como Date Planning', () => {
      const nonDateCases = [
        'comparteme un template de los proyectos que estan realizando para ir generando un plan de pruebas porfavor',
        'plan de pruebas para QA',
        'hacer el plan de contingencia del servidor',
        'plan de estudios de la materia de redes',
        'plan de negocios para la empresa'
      ];

      for (const tc of nonDateCases) {
        const matched = passiveExtractor.DATE_PLANNING_PATTERNS.some(pat => pat.test(tc));
        assert.ok(!matched, `El texto "${tc}" NO debió coincidir con DATE_PLANNING_PATTERNS`);
      }
    });
  });

  describe('matchExistingProject()', () => {
    const mockProjects = [
      { id: 'proj-1', name: 'Date Planning & Citas' },
      { id: 'proj-2', name: 'Cosplay Light Yagami' },
      { id: 'proj-3', name: 'Chamba & Empleo' }
    ];

    it('debe asociar salidas o planes con Erika a Date Planning', () => {
      const proj = passiveExtractor.matchExistingProject('vamos al cine con erika', mockProjects);
      assert.ok(proj);
      assert.equal(proj.id, 'proj-1');
    });

    it('debe asociar compras de cosplay al proyecto correspondiente', () => {
      const proj = passiveExtractor.matchExistingProject('comprar la peluca y corbata roja', mockProjects);
      assert.ok(proj);
      assert.equal(proj.id, 'proj-2');
    });

    it('debe asociar temas de CV a Chamba', () => {
      const proj = passiveExtractor.matchExistingProject('actualizar el cv para la entrevista de trabajo', mockProjects);
      assert.ok(proj);
      assert.equal(proj.id, 'proj-3');
    });
  });

  describe('MATERIAS_VOCABULARY & LIFE_PILARS_VOCABULARY', () => {
    it('debe contener las materias clave de CUCEA y sus regex asociadas', () => {
      const materias = passiveExtractor.MATERIAS_VOCABULARY;
      assert.ok(materias.length >= 7);

      const web = materias.find(m => m.name === 'Programación Web');
      assert.ok(web.regex.test('la tarea de programación web de fregoso'));

      const redes = materias.find(m => m.name === 'Fundamentos de Redes');
      assert.ok(redes.regex.test('configurar subred y packet tracer en redes'));

      const bi = materias.find(m => m.name === 'Inteligencia de Negocios');
      assert.ok(bi.regex.test('el reporte de kpi y data warehouse para bi'));
    });

    it('debe clasificar los pilares de vida correctamente', () => {
      const pilares = passiveExtractor.LIFE_PILARS_VOCABULARY;
      const uniPilar = pilares.find(p => p.key === 'universidad');
      assert.ok(uniPilar.regex.test('examen en cucea el viernes'));

      const hobbiePilar = pilares.find(p => p.key === 'hobbies');
      assert.ok(hobbiePilar.regex.test('patrón de crochet para amigurumi de hollow knight'));
    });
  });

  describe('Actionability Gate en processMessage()', () => {
    it('debe rechazar frases conversacionales de ocio o descanso sin registrarlas como tareas', async () => {
      const leisureTexts = [
        'voy a mimir un rato',
        'voy a descansar',
        'al rato voy a salir a caminar',
        'voy a ver anime'
      ];

      for (const text of leisureTexts) {
        const result = await passiveExtractor.processMessage(text, false);
        assert.equal(result, null, `"${text}" debió ser rechazado por el Actionability Gate`);
      }
    });

    it('debe rechazar frases de ubicación actual o presencia como tareas falsas', async () => {
      const locationTexts = [
        'Si ya estoy en la biblioteta de enfrente de cucea',
        'ya estoy en la biblioteca',
        'ando en camino',
        'voy llegando a cucea',
        'aquí estoy en el aula'
      ];

      for (const text of locationTexts) {
        const result = await passiveExtractor.processMessage(text, false);
        assert.equal(result, null, `"${text}" debió ser rechazado por ser ubicación/presencia`);
      }
    });

    it('debe capturar intención de queja o cancelación de tarea falsa', async () => {
      // Mock de última tarea en memoria
      passiveExtractor.lastCreatedTaskId = 'mock-task-id-123';
      passiveExtractor.lastCreatedTaskTitle = 'Si ya estoy en la biblioteca';

      // Interceptar archiveTask temporalmente
      const originalArchive = require('../../notion-actions.js').archiveTask;
      let archivedId = null;
      require('../../notion-actions.js').archiveTask = async (id) => {
        archivedId = id;
        return { id, archived: true };
      };

      try {
        const cancelResult = await passiveExtractor.processMessage('Ora, eso no es una tarea', true);
        assert.ok(cancelResult);
        assert.equal(cancelResult.action, 'task_canceled');
        assert.equal(archivedId, 'mock-task-id-123');
        assert.ok(cancelResult.message.includes('Ya cancelé y eliminé de Notion la tarea'));
      } finally {
        require('../../notion-actions.js').archiveTask = originalArchive;
      }
    });

    it('debe permitir tareas con sintaxis explícita sin filtrar por Actionability Gate', async () => {
      const res = await passiveExtractor.processMessage('tarea: subir informe semanal de redes', false);
      assert.ok(res);
      assert.equal(res.action, 'task_proposal');
      assert.equal(res.title, 'subir informe semanal de redes');
    });
  });
});

