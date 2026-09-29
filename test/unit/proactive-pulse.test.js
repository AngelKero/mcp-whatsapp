const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createTempRemindersDb } = require('../helpers/mock-db.js');
const { ProactivePulseEngine } = require('../../modules/proactive/proactive-pulse.js');
const taskRepository = require('../../repositories/task-repository.js');
const scheduleResolver = require('../../modules/academic/schedule-resolver.js');

describe('ProactivePulseEngine Unit Suite', () => {
  let tempDb;
  let pulseEngine;
  let notifications;

  beforeEach(() => {
    tempDb = createTempRemindersDb();
    pulseEngine = new ProactivePulseEngine(tempDb.db);
    notifications = [];

    // Interceptar notify para validar despachos sin invocar WhatsApp ni osascript
    pulseEngine.notify = async (title, message, sound) => {
      notifications.push({ title, message, sound });
    };
  });

  afterEach(() => {
    tempDb.cleanup();
  });

  describe('Idempotencia y SQLite (dispatched_pulses)', () => {
    it('debe registrar y consultar pulses despachados correctamente', () => {
      const key = 'test_pulse:123';
      assert.equal(pulseEngine.isPulseDispatched(key), false);

      pulseEngine.markPulseDispatched(key, 'test_cat', 'payload info');
      assert.equal(pulseEngine.isPulseDispatched(key), true);

      // Segundo registro debe actualizar sin arrojar error (ON CONFLICT)
      assert.doesNotThrow(() => {
        pulseEngine.markPulseDispatched(key, 'test_cat', 'updated payload');
      });
      assert.equal(pulseEngine.isPulseDispatched(key), true);
    });
  });

  describe('checkDeadlines() - Ventanas de 5 horas y 2 horas', () => {
    const origGetCachedTasks = taskRepository.getCachedTasks;

    afterEach(() => {
      taskRepository.getCachedTasks = origGetCachedTasks;
    });

    it('debe disparar aviso preventivo de 5 horas para tareas próximas', async () => {
      const now = Date.now();
      const in5Hours = new Date(now + 300 * 60 * 1000).toISOString(); // 5 horas exactas (300 min)

      taskRepository.getCachedTasks = () => [
        {
          task_id: 'task-5h',
          title: 'Práctica 4 de Redes',
          due_date: in5Hours
        }
      ];

      await pulseEngine.checkDeadlines();

      assert.equal(notifications.length, 1);
      assert.ok(notifications[0].title.includes('5h'));
      assert.ok(notifications[0].message.includes('unas 5 horas'));
      assert.ok(notifications[0].message.includes('Práctica 4 de Redes'));
      assert.equal(pulseEngine.isPulseDispatched('deadline:5h:task-5h'), true);

      // Segunda llamada inmediata: idempotencia, no debe duplicar notificación
      await pulseEngine.checkDeadlines();
      assert.equal(notifications.length, 1, 'No debe notificar dos veces por la misma tarea');
    });

    it('debe disparar alerta crítica de 2 horas para tareas a vencer', async () => {
      const now = Date.now();
      const in2Hours = new Date(now + 110 * 60 * 1000).toISOString(); // ~1.8 horas (110 min)

      taskRepository.getCachedTasks = () => [
        {
          task_id: 'task-2h',
          title: 'Entrega Final Bases de Datos',
          due_date: in2Hours
        }
      ];

      await pulseEngine.checkDeadlines();

      assert.equal(notifications.length, 1);
      assert.ok(notifications[0].title.includes('2h'));
      assert.ok(notifications[0].message.includes('unas 2 horas') || notifications[0].message.includes('como 2 horas'));
      assert.ok(notifications[0].message.includes('Entrega Final Bases de Datos'));
      assert.equal(pulseEngine.isPulseDispatched('deadline:2h:task-2h'), true);
    });

    it('no debe disparar alertas si la tarea vence fuera de las ventanas (ej. 10 horas)', async () => {
      const now = Date.now();
      const in10Hours = new Date(now + 600 * 60 * 1000).toISOString(); // 10 horas

      taskRepository.getCachedTasks = () => [
        {
          task_id: 'task-10h',
          title: 'Examen de Sistemas',
          due_date: in10Hours
        }
      ];

      await pulseEngine.checkDeadlines();
      assert.equal(notifications.length, 0);
    });

    it('debe consolidar múltiples tareas que vencen en la misma ventana en un solo mensaje', async () => {
      const now = Date.now();
      const in2Hours = new Date(now + 110 * 60 * 1000).toISOString();

      taskRepository.getCachedTasks = () => [
        { task_id: 'task-a', title: 'Práctica MySQL', due_date: in2Hours },
        { task_id: 'task-b', title: 'Ejercicios Procedimientos', due_date: in2Hours },
        { task_id: 'task-c', title: 'Práctica Bases de Datos', due_date: in2Hours }
      ];

      await pulseEngine.checkDeadlines();

      assert.equal(notifications.length, 1, 'Debe enviar exactamente 1 mensaje consolidado');
      assert.ok(notifications[0].title.includes('3 Vencimientos'));
      assert.ok(notifications[0].message.includes('Práctica MySQL'));
      assert.ok(notifications[0].message.includes('Ejercicios Procedimientos'));
      assert.ok(notifications[0].message.includes('Práctica Bases de Datos'));
      assert.equal(pulseEngine.isPulseDispatched('deadline:2h:task-a'), true);
      assert.equal(pulseEngine.isPulseDispatched('deadline:2h:task-b'), true);
      assert.equal(pulseEngine.isPulseDispatched('deadline:2h:task-c'), true);
    });
  });

  describe('checkUpcomingClasses() - Avisos de Salida a CUCEA', () => {
    const origGetUpcoming = scheduleResolver.getUpcomingClassSlot;

    afterEach(() => {
      scheduleResolver.getUpcomingClassSlot = origGetUpcoming;
    });

    it('debe notificar la salida a campus cuando hay clase en ~45 min', async () => {
      scheduleResolver.getUpcomingClassSlot = () => ({
        id: 'redes_miercoles',
        name: 'Fundamentos de Redes',
        startTime: '16:00',
        diffMins: 45,
        aula: 'B-201',
        prof: 'Claustro de Redes'
      });

      await pulseEngine.checkUpcomingClasses();

      assert.equal(notifications.length, 1);
      assert.ok(notifications[0].title.includes('Salida a CUCEA'));
      assert.ok(notifications[0].message.includes('Fundamentos de Redes'));
      assert.ok(notifications[0].message.includes('B-201'));
      assert.ok(notifications[0].message.includes('16:00'));

      // Verificar idempotencia
      await pulseEngine.checkUpcomingClasses();
      assert.equal(notifications.length, 1);
    });

    it('no debe enviar aviso si no hay clases en ventana de salida', async () => {
      scheduleResolver.getUpcomingClassSlot = () => null;

      await pulseEngine.checkUpcomingClasses();
      assert.equal(notifications.length, 0);
    });
  });
});
