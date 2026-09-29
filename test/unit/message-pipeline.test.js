const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { MessagePipeline } = require('../../pipeline/message-pipeline.js');

describe('MessagePipeline (Chain of Responsibility)', () => {
  it('debe ejecutar los middlewares en el orden exacto en que fueron registrados', async () => {
    const pipeline = new MessagePipeline();
    const order = [];

    pipeline.use(async (ctx, next) => {
      order.push(1);
      await next();
      order.push(4);
    });

    pipeline.use(async (ctx, next) => {
      order.push(2);
      await next();
      order.push(3);
    });

    await pipeline.execute({});
    assert.deepEqual(order, [1, 2, 3, 4]);
  });

  it('debe permitir mutar el objeto de contexto entre middlewares', async () => {
    const pipeline = new MessagePipeline();
    pipeline.use(async (ctx, next) => {
      ctx.step1 = 'alpha';
      await next();
    });
    pipeline.use(async (ctx, next) => {
      ctx.step2 = 'beta';
      await next();
    });

    const context = { initial: true };
    await pipeline.execute(context);
    assert.equal(context.initial, true);
    assert.equal(context.step1, 'alpha');
    assert.equal(context.step2, 'beta');
  });

  it('debe abortar la cadena si un middleware no invoca next()', async () => {
    const pipeline = new MessagePipeline();
    let secondCalled = false;

    pipeline.use(async (ctx, next) => {
      // Aborta intencionalmente sin llamar next()
    });

    pipeline.use(async (ctx, next) => {
      secondCalled = true;
      await next();
    });

    await pipeline.execute({});
    assert.equal(secondCalled, false);
  });

  it('debe propagar errores si un middleware lanza una excepción', async () => {
    const pipeline = new MessagePipeline();
    pipeline.use(async () => {
      throw new Error('Fallo crítico en middleware');
    });

    await assert.rejects(
      async () => await pipeline.execute({}),
      { message: 'Fallo crítico en middleware' }
    );
  });

  it('debe rechazar llamadas duplicadas a next() en el mismo middleware', async () => {
    const pipeline = new MessagePipeline();
    pipeline.use(async (ctx, next) => {
      await next();
      await next(); // Llamada duplicada
    });
    pipeline.use(async (ctx, next) => {
      await next();
    });

    await assert.rejects(
      async () => await pipeline.execute({}),
      { message: /next\(\) llamado múltiples veces/ }
    );
  });

  it('debe validar que solo se registren funciones en .use()', () => {
    const pipeline = new MessagePipeline();
    assert.throws(() => pipeline.use(null), TypeError);
    assert.throws(() => pipeline.use('no-es-una-funcion'), TypeError);
    assert.throws(() => pipeline.use({}), TypeError);
  });
});
