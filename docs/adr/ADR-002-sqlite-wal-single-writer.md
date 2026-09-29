# ADR-002: Almacenamiento SQLite en Modo WAL con Daemon de Escritura Único

## Estado
Aceptado

## Contexto
El sistema requiere persistir mensajes (+32,900 registros), sesiones conversacionales, índices de búsqueda de texto completo (FTS5) y tokens de sesión de WhatsApp. Múltiples procesos (el daemon en Go `whatsapp-mcp`, el watcher en Node.js `whatsapp-watcher.js`, scripts de extracción y tareas periódicas) necesitan acceder a los datos sin corromper la base de datos ni bloquearse mutuamente.

## Decisión
1. Configurar SQLite en modo **Write-Ahead Logging (WAL)** con pragmas optimizados:
   `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;`
2. El binario en Go (`whatsapp-mcp serve`) es el **único escritor principal** de `messages.db` y adquiere un candado de archivo exclusivo (`store/.lock` vía `flock`).
3. El watcher de Node.js se conecta a `messages.db` estrictamente con `{ readOnly: true }` y utiliza una base de datos SQLite independiente (`store/sessions.db` y `store/reminders.db`) para almacenar el estado de la IA y el registro de pulsos proactivos.

## Consecuencias
- **Positivas:** Lecturas concurrentes no bloqueadas por transacciones de escritura; cero corrupción de base de datos; protección estricta contra instancias duplicadas del daemon.
- **Negativas:** La tabla de mensajes no debe ser modificada directamente por procesos de Node.js; cualquier mutación debe realizarse a través de las herramientas MCP expuestas por el daemon de Go.
