# Tasks

## 1. Reacción con remitente grupal

- [x] 1.1 Extender `sendReaction(recipient, messageId, emoji, senderJid='')` en `mcp-client.js` (pasa `sender_jid` solo cuando se provee; firma retrocompatible) y verificar con test que en grupo incluye sender y en 1:1 lo omite.

## 2. Ciclo ack en el turno

- [x] 2.1 Añadir helper de ciclo (`ack on` con 👀+typing concurrentes vía `Promise.allSettled`, `ack off` con `""` best-effort) y montarlo al abrir `processAiTurn` en `whatsapp-watcher.js` (target `lastMsg.id`, sender `lastMsg.sender` en grupos), con limpieza en `finally` tras cada rama de envío (éxito y error), y verificar en 1:1 y grupo que la secuencia de tools es `send_reaction(👀)` → respuesta → `send_reaction("")`.
- [x] 2.2 Verificar fail-open: con `send_reaction` mockeado en fallo total, el turno completa y la respuesta llega igual (test con daemon simulado caído).

## 3. Suite normativa

- [x] 3.1 Crear `test/unit/ack-reactions.test.js` (montar 👀 con sender correcto por tipo de chat; dispatch no bloqueado por el ack; desmontar con `""` ante éxito; desmontar ante fallo de inferencia; sin turnos nuevos a partir de eventos de reacción — filtro por contenido vacío + anti-echo de IDs propios) y verificar con `node --test test/unit/ack-reactions.test.js`.
- [x] 3.2 Correr `npm run test:scenarios` y `npm run test:unit` completos y verificar cero regresiones (los 3 fallos preexistentes de `chat-permissions.test.js` documentados aparte, no cuentan).

## 4. Validación final

- [x] 4.1 Correr `make vet` limpio y `grep -rn "subscribe_presence\|profile-photo\|communities" internal/mcp/` vacío (parity: 42 tools sin cambios) y verificar salida.
- [x] 4.2 Validar con `openspec validate add-ack-reactions --strict` y verificar cero errores antes de archivar.
