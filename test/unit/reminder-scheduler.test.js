const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { ReminderScheduler } = require('../../reminder-scheduler.js');
const taskRepository = require('../../repositories/task-repository.js');

describe('ReminderScheduler Unit Suite', () => {
  let scheduler;
  let dispatchedCalls;
  let origGetCachedTasks;
  let origIsDispatched;
  let origMarkDispatched;

  beforeEach(() => {
    scheduler = new ReminderScheduler(async () => {});
    dispatchedCalls = [];

    origGetCachedTasks = taskRepository.getCachedTasks;
    origIsDispatched = taskRepository.isDispatched;
    origMarkDispatched = taskRepository.markDispatched;

    taskRepository.markDispatched = (id, title, date) => {
      dispatchedCalls.push({ id, title, date });
    };
  });

  afterEach(() => {
    scheduler.stop();
    taskRepository.getCachedTasks = origGetCachedTasks;
    taskRepository.isDispatched = origIsDispatched;
    taskRepository.markDispatched = origMarkDispatched;
  });

  it('debe despachar tareas que caen dentro de la ventana activa (-45s a +2h)', async () => {
    const now = Date.now();
    const dueNow = new Date(now - 5000).toISOString(); // 5 segundos atrás (vencido recientemente)

    taskRepository.getCachedTasks = () => [
      {
        task_id: 'task-due-soon',
        title: 'Tomar pastilla',
        due_date: dueNow
      }
    ];
    taskRepository.isDispatched = () => false;

    const dispatched = await scheduler.checkDueReminders();

    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].taskId, 'task-due-soon');
    assert.equal(dispatched[0].title, 'Tomar pastilla');
    assert.equal(dispatchedCalls.length, 1);
    assert.equal(dispatchedCalls[0].id, 'task-due-soon');
  });

  it('no debe despachar tareas que ya fueron marcadas como dispatched', async () => {
    const now = Date.now();
    const dueNow = new Date(now).toISOString();

    taskRepository.getCachedTasks = () => [
      {
        task_id: 'task-already-done',
        title: 'Hacer ejercicio',
        due_date: dueNow
      }
    ];
    taskRepository.isDispatched = (id) => id === 'task-already-done';

    const dispatched = await scheduler.checkDueReminders();
    assert.equal(dispatched.length, 0);
    assert.equal(dispatchedCalls.length, 0);
  });

  it('no debe despachar tareas fuera de la ventana (> 2 horas futuras)', async () => {
    const now = Date.now();
    const dueIn5Hours = new Date(now + 5 * 60 * 60 * 1000).toISOString();

    taskRepository.getCachedTasks = () => [
      {
        task_id: 'task-far-future',
        title: 'Plan para la noche',
        due_date: dueIn5Hours
      }
    ];
    taskRepository.isDispatched = () => false;

    const dispatched = await scheduler.checkDueReminders();
    assert.equal(dispatched.length, 0);
    assert.equal(dispatchedCalls.length, 0);
  });

  it('debe iniciar y detener los timers limpiamente con start() y stop()', () => {
    assert.equal(scheduler.timer, null);
    assert.equal(scheduler.syncTimer, null);

    scheduler.start(5000);
    assert.ok(scheduler.timer !== null);
    assert.ok(scheduler.syncTimer !== null);

    scheduler.stop();
    assert.equal(scheduler.timer, null);
    assert.equal(scheduler.syncTimer, null);
  });
});
