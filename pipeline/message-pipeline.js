/**
 * pipeline/message-pipeline.js
 * Implementación canónica del patrón Chain of Responsibility (Middleware Pipeline)
 * para el procesamiento secuencial y desacoplado de mensajes de WhatsApp.
 */

class MessagePipeline {
  constructor() {
    this.middlewares = [];
  }

  /**
   * Registra un nuevo middleware en la cadena
   * @param {Function} middleware - async (context, next) => {}
   */
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new TypeError('El middleware debe ser una función ejecutable');
    }
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Ejecuta la cadena completa de middlewares pasando el contexto compartido
   * @param {object} context
   */
  async execute(context) {
    let prevIndex = -1;

    const runner = async (index) => {
      if (index <= prevIndex) {
        throw new Error('next() llamado múltiples veces en el mismo middleware');
      }
      prevIndex = index;

      if (index >= this.middlewares.length) {
        return;
      }

      const middleware = this.middlewares[index];
      await middleware(context, () => runner(index + 1));
    };

    await runner(0);
  }
}

module.exports = {
  MessagePipeline
};
