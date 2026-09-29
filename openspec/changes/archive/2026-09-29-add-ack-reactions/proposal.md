# Proposal

## Why

Cuando un comando o la IA tarda segundos en responder, el usuario no ve nada: ni typing sostenido más allá del refresco actual ni acuse de lectura del mensaje atendido. La comunidad resuelve esto con feedback visual inmediato — reacción 👀 al recibir + typing durante la inferencia + limpieza al despachar (el reemplazo nativo a los mensajes cosméticos "⏳ Working on it…" que en WhatsApp no se pueden borrar y ensucian el chat).

## What Changes

- Al iniciar `processAiTurn` (o comandos que tomen >500ms), el watcher monta reacción 👀 al `messageId` entrante vía `send_reaction` y mantiene `typing` con el `TypingPresenceManager` existente.
- Al despachar la respuesta (éxito o error), un bloque `finally` limpia la reacción (emoji `""`) justo después del envío.
- Fail-open estricto: si `send_reaction` falla (desconexión, mensaje efímero/expirado), log discreto y la inferencia continúa sin interrumpir al usuario.
- Anti-echo garantizado por construcción: las reacciones entrantes llegan sin contenido de texto y el watcher las salta; los IDs propios se descartan — sin bucles posibles.
- `sendReaction` de `mcp-client.js` acepta `senderJid` opcional (requerido por el daemon en grupos; hoy no lo pasa y las reacciones en grupo fallan).
- Suite `test/unit/ack-reactions.test.js`: ciclo montar → dispatch → desmontar ante éxito y ante fallo.

## Capabilities

### New Capabilities

- `ack-reactions`: acuse visual de procesamiento — reacción 👀 + typing coexistiendo, limpieza en `finally`, fail-open, sin eco.

### Modified Capabilities

(none — ninguna spec vigente describe reacciones ni presencia; el contrato es nuevo sin alterar respuestas existentes.)

## Impact

- Código afectado: `whatsapp-watcher.js` (`processAiTurn`, `TypingPresenceManager` sin cambios de firma), `mcp-client.js` (`sendReaction` + parámetro `senderJid` opcional, retrocompatible), `test/unit/ack-reactions.test.js` (nuevo).
- MCP tools (42): sin cambios de superficie; mayor uso de `send_reaction` (ya expone borrado con `""`) y `send_typing` existentes. Sin `subscribe_presence` ni surface diferida.
- Store schema: sin cambios. Anti-echo sin cambios (las reacciones no generan filas procesables).
- Rollback: revert + reinicio del watcher vía launchd (`kickstart -k`); daemon Go intacto (sin re-pair, sin rebuild).
