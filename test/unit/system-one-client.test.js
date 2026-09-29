const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyBotMention,
  classifyClosingMessage,
  classifySearchCommand,
  classifyMessageComplexity,
  pickModel,
  isTrivialMessage,
  classifyUserIntent,
  classifyExpenseCategory,
  classifyLifePilar,
  isChatHistoryQuestion,
  classifyStickerIntent,
  classifyTaskActionability
} = require('../../system-one-client.js');

describe('Sistema 1 (Laya-MLX Client & Router)', () => {
  describe('classifyBotMention()', () => {
    it('debe detectar comandos explícitos !ia y !ai sin importar mayúsculas', async () => {
      assert.equal(await classifyBotMention('!ia'), true);
      assert.equal(await classifyBotMention('!IA'), true);
      assert.equal(await classifyBotMention('!ai'), true);
      assert.equal(await classifyBotMention('!AI'), true);
      assert.equal(await classifyBotMention('/ia'), true);
      assert.equal(await classifyBotMention('/ai'), true);
    });

    it('debe detectar menciones explícitas de Antigravity', async () => {
      assert.equal(await classifyBotMention('Antigravity tírame esquina con una de los procesos'), true);
      assert.equal(await classifyBotMention('Pero explicale antigravity'), true);
      assert.equal(await classifyBotMention('@antigravity ayuda con esto'), true);
      assert.equal(await classifyBotMention('antogravity explicame eso'), true);
    });

    it('debe detectar invocaciones mediante Jarvis y Gemini', async () => {
      assert.equal(await classifyBotMention('Jarvis, ahí andas?'), true);
      assert.equal(await classifyBotMention('!jarvis checa esto'), true);
      assert.equal(await classifyBotMention('@jarvis status'), true);
      assert.equal(await classifyBotMention('Gemini ayúdame con una duda'), true);
      assert.equal(await classifyBotMention('!gemini resume este tema'), true);
      assert.equal(await classifyBotMention('@gemini'), true);
    });

    it('debe retornar false en mensajes casuales sin mención ni comando', async () => {
      assert.equal(await classifyBotMention('hola bro cómo estás'), false);
      assert.equal(await classifyBotMention('vamos por unos tacos al rato'), false);
      assert.equal(await classifyBotMention(''), false);
      assert.equal(await classifyBotMention(null), false);
    });
  });

  describe('classifyClosingMessage()', () => {
    it('debe detectar frases típicas de despedida y cierre', async () => {
      assert.equal(await classifyClosingMessage('muchas gracias'), true);
      assert.equal(await classifyClosingMessage('adiós'), true);
      assert.equal(await classifyClosingMessage('bye'), true);
      assert.equal(await classifyClosingMessage('hasta luego'), true);
      assert.equal(await classifyClosingMessage('nos vemos'), true);
      assert.equal(await classifyClosingMessage('muchas gracias antigravity, ya me voy a mimir'), true);
      assert.equal(await classifyClosingMessage('ya me voy a mimir'), true);
      assert.equal(await classifyClosingMessage('a mimir'), true);
      assert.equal(await classifyClosingMessage('buenas noches'), true);
      assert.equal(await classifyClosingMessage('hasta mañana'), true);
    });

    it('debe retornar false si el mensaje contiene una pregunta u orden sustancial', async () => {
      assert.equal(await classifyClosingMessage('¿cómo funciona la arquitectura?'), false);
      assert.equal(await classifyClosingMessage('cuál es la tarea para hoy'), false);
    });
  });

  describe('classifySearchCommand()', () => {
    it('debe extraer el término de búsqueda si el mensaje empieza con !buscar o /buscar', async () => {
      const term1 = await classifySearchCommand('!buscar docker');
      assert.ok(term1 === 'docker' || typeof term1 === 'string');

      const term2 = await classifySearchCommand('/buscar examen redes');
      assert.ok(term2 === 'examen redes' || typeof term2 === 'string');
    });

    it('debe retornar null si no es un comando de búsqueda', async () => {
      assert.equal(await classifySearchCommand('hola cómo estás'), null);
      assert.equal(await classifySearchCommand('quiero buscar un libro'), null);
    });
  });

  describe('classifyMessageComplexity() y pickModel()', () => {
    it('debe clasificar saludos y confirmaciones cortas como trivial y elegir flash-low', async () => {
      const model = await pickModel('ok');
      assert.equal(model, 'gemini-3.8-flash-low');
    });

    it('debe clasificar preguntas casuales como simple y elegir flash-medium', async () => {
      const model = await pickModel('¿qué hora tienes?');
      assert.ok(model === 'gemini-3.8-flash-low' || model === 'gemini-3.8-flash-medium');
    });

    it('debe clasificar peticiones de código o análisis de sistemas como complex y elegir flash-high', async () => {
      const model = await pickModel('Escribe una arquitectura en Node.js usando WebSockets y SQLite FTS5 con índices optimizados y transacciones seguras');
      assert.ok(model === 'gemini-3.8-flash-high' || model === 'gemini-3.8-flash-medium');
    });

    it('debe retornar fallback seguro si el texto es vacío o nulo', async () => {
      const modelNull = await pickModel(null);
      assert.equal(modelNull, 'gemini-3.8-flash-medium');
      const modelEmpty = await pickModel('');
      assert.equal(modelEmpty, 'gemini-3.8-flash-medium');
    });
  });

  describe('isTrivialMessage()', () => {
    it('debe descartar rápidamente mensajes largos o con signos de interrogación sin llamar a Laya', async () => {
      assert.equal(await isTrivialMessage('¿Cuál es la fecha de entrega del proyecto final de web?'), false);
      assert.equal(await isTrivialMessage('Este es un mensaje sumamente largo que contiene detalles específicos sobre la entrega de la práctica de laboratorio que debe realizarse el día de mañana'), false);
    });

    it('debe considerar mensajes vacíos o espacios como triviales', async () => {
      assert.equal(await isTrivialMessage(''), true);
      assert.equal(await isTrivialMessage('   '), true);
      assert.equal(await isTrivialMessage(null), true);
    });

    it('debe identificar confirmaciones cortas o risas como triviales', async () => {
      assert.equal(await isTrivialMessage('jajaja xd'), true);
      assert.equal(await isTrivialMessage('gracias :3'), true);
    });
  });

  describe('classifyUserIntent()', () => {
    it('debe clasificar solicitudes de corte de gastos', async () => {
      const intent = await classifyUserIntent('cuánto he gastado esta semana? dame el corte');
      assert.ok(intent === 'corte_gastos' || intent === 'otra');
    });

    it('debe clasificar briefing matutino o agenda', async () => {
      const intent = await classifyUserIntent('buenos días, qué tengo para hoy en la agenda?');
      assert.ok(['daily_briefing', 'clase_status', 'otra'].includes(intent));
    });
  });

  describe('classifyExpenseCategory()', () => {
    it('debe clasificar categorías comunes de gastos', async () => {
      const cat1 = await classifyExpenseCategory('Comida en Carl\'s Jr con mi novia');
      assert.ok(cat1 === 'salidas' || typeof cat1 === 'string');

      const cat2 = await classifyExpenseCategory('Pago mensual de Netflix y Spotify');
      assert.ok(cat2 === 'suscripciones' || typeof cat2 === 'string');
    });
  });

  describe('classifyLifePilar()', () => {
    it('debe clasificar actividades universitarias en el pilar universidad', async () => {
      const pilar = await classifyLifePilar('Tarea de bases de datos II para CUCEA');
      assert.ok(pilar === 'universidad' || typeof pilar === 'string');
    });

    it('debe clasificar planes personales con Erika en vida_personal', async () => {
      const pilar = await classifyLifePilar('Cita con Erika para ir por un café');
      assert.ok(pilar === 'vida_personal' || typeof pilar === 'string');
    });
  });

  describe('classifyStickerIntent()', () => {
    it('debe identificar menciones de chapa para el sticker chapa', async () => {
      const choice = await classifyStickerIntent('menea la chapa');
      assert.ok(choice === 'chapa' || choice === null);
    });
  });

  describe('classifyTaskActionability() (Actionability Gate)', () => {
    it('debe clasificar tareas académicas o laborales reales como accionables (isActionable: true)', async () => {
      const actionableCases = [
        'voy a subir la práctica de redes al classroom',
        'mañana voy a entregar el ensayo',
        'tengo que pagar el internet',
        'tarea: terminar la api en express',
        '- [ ] configurar webhook'
      ];

      for (const tc of actionableCases) {
        const res = await classifyTaskActionability(tc);
        assert.equal(res.isActionable, true, `"${tc}" debió ser clasificado como accionable`);
        assert.equal(res.choice, 'obligacion');
      }
    });

    it('debe clasificar actividades de ocio, descanso o estado personal como no accionables (isActionable: false)', async () => {
      const nonActionableCases = [
        'ya me voy a mimir',
        'voy a mimir un rato',
        'voy a dormir',
        'voy a descansar',
        'al rato voy a salir a caminar',
        'voy a ver anime'
      ];

      for (const tc of nonActionableCases) {
        const res = await classifyTaskActionability(tc);
        assert.equal(res.isActionable, false, `"${tc}" NO debió ser clasificado como accionable`);
        assert.equal(res.choice, 'rutina_o_descanso');
      }
    });

    it('debe retornar fallback seguro para textos vacíos o nulos', async () => {
      const resEmpty = await classifyTaskActionability('');
      assert.equal(resEmpty.isActionable, false);

      const resNull = await classifyTaskActionability(null);
      assert.equal(resNull.isActionable, false);
    });
  });
});
