const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  KNOWN_MARKETPLACE_JIDS,
  MARKETPLACE_NAME_REGEX,
  isMarketplaceChat,
  isExplicitMarketplaceRequest
} = require('../../config/marketplace-filter.js');
const createGatekeeperMiddleware = require('../../pipeline/middlewares/gatekeeper.middleware.js');
const createMediaExtractorMiddleware = require('../../pipeline/middlewares/media-extractor.middleware.js');
const { classifyBotMention, classifySearchCommand } = require('../../system-one-client.js');

describe('Marketplace & Sales Filter Suite', () => {
  describe('isMarketplaceChat()', () => {
    it('debe identificar JIDs de grupos comerciales conocidos', () => {
      assert.equal(isMarketplaceChat('120363038501758837@g.us'), true, 'CUCEA EATS debe ser marketplace');
      assert.equal(isMarketplaceChat('120363219998535614@g.us'), true, 'Mercadito cucea 2 debe ser marketplace');
      assert.equal(isMarketplaceChat('120363411182361723@g.us'), true, 'El Barrio de Andares debe ser marketplace');
      assert.equal(isMarketplaceChat('120363421831313721@g.us'), true, 'El panadero con el pan debe ser marketplace');
    });

    it('debe identificar grupos por nombre semántico de compra/venta/bazar/comida', () => {
      const salesNames = [
        'CUCEA EATS 2.0',
        'Mercadito cucea 2',
        'Bazar Universitario',
        'Tianguis de ropa',
        'Compra y Venta Guadalajara',
        'Venta de comida',
        'Anuncios y Publicidad',
        'Ofertas y clasificados',
        'Subastas GDL'
      ];

      for (const name of salesNames) {
        assert.equal(isMarketplaceChat('random-jid@g.us', name), true, `"${name}" debió ser identificado como marketplace`);
      }
    });

    it('no debe clasificar grupos académicos, familiares o de amigos como marketplace', () => {
      const nonSales = [
        'Programación Web',
        'Bases de Datos II',
        'Fundamentos de Redes',
        'Inteligencia de Negocios',
        'Pollos Asados',
        'GAYmers 🎮🤪',
        'David',
        'Pipo',
        'Carnita asada'
      ];

      for (const name of nonSales) {
        assert.equal(isMarketplaceChat('academic-jid@g.us', name), false, `"${name}" NO debió ser marketplace`);
      }
    });
  });

  describe('isExplicitMarketplaceRequest()', () => {
    it('debe rechazar cualquier mensaje si no proviene de Angel (isFromAngel = false)', () => {
      assert.equal(isExplicitMarketplaceRequest('!buscar tacos', false), false);
      assert.equal(isExplicitMarketplaceRequest('!ia hola', false), false);
      assert.equal(isExplicitMarketplaceRequest('@antigravity ayuda', false), false);
      assert.equal(isExplicitMarketplaceRequest('Cinturones premium a la venta', false), false);
    });

    it('debe rechazar plática casual o pedidos comerciales normales de Angel sin comando', () => {
      assert.equal(isExplicitMarketplaceRequest('Hola, ¿tienen tacos al pastor?', true), false);
      assert.equal(isExplicitMarketplaceRequest('A cuánto el kilo de fresas?', true), false);
      assert.equal(isExplicitMarketplaceRequest('Te mando transferencia al rato', true), false);
    });

    it('debe permitir comandos explícitos de búsqueda o IA enviados por Angel', () => {
      assert.equal(isExplicitMarketplaceRequest('!buscar tacos de birria', true), true);
      assert.equal(isExplicitMarketplaceRequest('/buscar cinturones', true), true);
      assert.equal(isExplicitMarketplaceRequest('!ia busca tortas ahogadas', true), true);
      assert.equal(isExplicitMarketplaceRequest('@antigravity busca libros', true), true);
      assert.equal(isExplicitMarketplaceRequest('!ia dime qué hay de comer', true), true);
      assert.equal(isExplicitMarketplaceRequest('/jarvis ayuda', true), true);
      assert.equal(isExplicitMarketplaceRequest('antigravity: busca tacos', true), true);
    });
  });

  describe('Integración con Gatekeeper Middleware', () => {
    it('debe ignorar mensajes de vendedores o terceros en grupos de ventas', async () => {
      let nextCalled = false;
      const enqueued = [];
      const chatQueue = { enqueue: (jid, item) => enqueued.push(item) };
      const middleware = createGatekeeperMiddleware({ remember: () => {} }, chatQueue);

      const ctx = {
        text: '🥋 *CINTURONES PREMIUM* 🥋\nMarcas disponibles: FERRAGAMO...',
        chatJid: '120363038501758837@g.us', // CUCEA EATS 2.0
        contactName: 'CUCEA EATS 2.0',
        sender: '5213325082591',
        senderName: 'Vendedor',
        isGroup: true,
        isFromAngel: false,
        isFromErika: false,
        isMyOwnChat: false,
        msg: { id: 'msg-belt-123' }
      };

      await middleware(ctx, () => { nextCalled = true; });

      assert.equal(nextCalled, true, 'Debe llamar a next() para dejar pasar sin responder');
      assert.equal(enqueued.length, 0, 'No debió encolar nada para la IA');
    });

    it('debe permitir excepciones cuando Angel envía una orden explícita en grupo de ventas', async () => {
      let nextCalled = false;
      const enqueued = [];
      const chatQueue = { enqueue: (jid, item) => enqueued.push(item) };
      const middleware = createGatekeeperMiddleware({ remember: () => {} }, chatQueue);

      const ctx = {
        text: '!ia busca quién vende hamburguesas en cucea',
        chatJid: '120363038501758837@g.us', // CUCEA EATS 2.0
        contactName: 'CUCEA EATS 2.0',
        sender: '5213325094748',
        senderName: 'Angel',
        isGroup: true,
        isFromAngel: true,
        isFromErika: false,
        isMyOwnChat: false,
        msg: { id: 'msg-search-123' }
      };

      await middleware(ctx, () => { nextCalled = true; });

      assert.equal(nextCalled, false, 'No debe llamar a next() porque fue interceptado');
      assert.equal(enqueued.length, 1, 'Debió encolar la orden explícita de Angel');
      assert.equal(enqueued[0].isMarketplace, true);
    });
  });

  describe('Integración con Media Extractor Middleware', () => {
    it('debe saltarse la extracción de comprobantes e imágenes en chats de marketplace', async () => {
      let nextCalled = false;
      let mediaStarted = false;
      const chatQueue = { startMediaPending: () => { mediaStarted = true; } };
      const middleware = createMediaExtractorMiddleware(chatQueue);

      const ctx = {
        msg: { id: 'receipt-img-123' },
        chatJid: '120363038501758837@g.us',
        contactName: 'CUCEA EATS 2.0',
        isImage: true,
        isGroup: true,
        isFromAngel: false,
        isFromErika: false,
        isMyOwnChat: false
      };

      await middleware(ctx, () => { nextCalled = true; });

      assert.equal(nextCalled, true);
      assert.equal(mediaStarted, false, 'No debió iniciar extracción multimedia en marketplace');
    });
  });

  describe('Protección Anti Falsos Positivos en System One', () => {
    it('no debe interpretar palabras en español que terminan en "ia " como mención a la IA', async () => {
      const spanishWords = [
        'Estilo, elegancia y exclusividad en cada detalle.',
        'Cuenta con garantía de satisfacción.',
        'Se ubica en la categoría de moda.',
        'La papelería está abierta.',
        'Tenía muchas ganas de unos tacos.'
      ];

      for (const text of spanishWords) {
        const isBot = await classifyBotMention(text);
        assert.equal(isBot, false, `"${text}" NO debió ser clasificado como mención a la IA`);
      }
    });

    it('debe reconocer comandos de búsqueda ampliados con classifySearchCommand', async () => {
      assert.equal(await classifySearchCommand('!buscar tacos al pastor'), 'tacos al pastor');
      assert.equal(await classifySearchCommand('/buscar cinturon ferragamo'), 'cinturon ferragamo');
      assert.equal(await classifySearchCommand('!ia busca galletas'), 'galletas');
      assert.equal(await classifySearchCommand('@antigravity busca apuntes'), 'apuntes');
      assert.equal(await classifySearchCommand('jarvis busca cargador'), 'cargador');
    });
  });
});
