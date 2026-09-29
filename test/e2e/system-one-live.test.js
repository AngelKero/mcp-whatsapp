const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { SYSTEM_ONE_URL } = require('../../config/env.js');
const { askSystemOne } = require('../../system-one-client.js');

describe('E2E: System One (Laya-MLX Live Server on :8766)', () => {
  it('el endpoint /health debe responder 200 con status "ok" y metadata del motor Apple M1', async () => {
    const origin = new URL(SYSTEM_ONE_URL).origin;
    const healthUrl = `${origin}/health`;
    let res;
    try {
      res = await fetch(healthUrl);
    } catch (err) {
      assert.fail(`El servidor System One no está corriendo en ${healthUrl}: ${err.message}`);
    }

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.engine, 'laya-mlx');
    assert.equal(body.chip, 'Apple M1');
  });

  it('debe responder clasificaciones en tiempo real con latencia media < 80ms tras warmup', async () => {
    const questions = {
      tipo: {
        type: 'choice',
        instructions: '¿Cuál es el propósito principal de este texto?',
        criteria: {
          pregunta: 'Hacer una pregunta o resolver una duda',
          saludo: 'Saludar o despedirse de una persona',
          orden: 'Dar una instrucción o pedir una tarea'
        }
      }
    };

    // Warmup de conexión HTTP Keep-Alive
    await askSystemOne('warmup check', questions);

    const samplePrompts = [
      'Hola buenos días como amanecieron todos hoy',
      '¿A qué hora empieza la clase de redes en CUCEA?',
      'Por favor genera el reporte de ventas del mes',
      'Nos vemos mañana en el campus'
    ];

    const latencies = [];

    for (const prompt of samplePrompts) {
      const start = performance.now();
      const res = await askSystemOne(prompt, questions);
      const elapsed = performance.now() - start;
      latencies.push(elapsed);

      assert.ok(res, 'Debe retornar un objeto válido');
      assert.ok(res.answers, 'Debe contener la propiedad answers');
      assert.ok(res.answers.tipo, 'Debe contener la respuesta a la pregunta "tipo"');
      assert.ok(['pregunta', 'saludo', 'orden'].includes(res.answers.tipo.choice));
    }

    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    console.log(`⚡ [E2E LAYA LATENCY] Latencias: [${latencies.map(l => l.toFixed(1) + 'ms').join(', ')}] | Media: ${avgLatency.toFixed(1)}ms`);

    assert.ok(avgLatency < 2000, `La latencia promedio (${avgLatency.toFixed(1)}ms) debe ser menor a 2000ms bajo carga concurrente`);
  });
});
