# Design

## Context

See proposal.md (Why) and `specs/ack-reactions/spec.md`. Observed in repo:

- `processAiTurn(chatJid, lastMsg, ...)` ya arranca `presenceManager.start(chatJid)` (typing con refresco cada 3s) y lo detiene en cada salida; las 3 ramas de envío (fast-path, quick replies, IA) están centralizadas y conocen `lastMsg.id`.
- `mcp-client.js` expone `sendReaction(recipient, messageId, emoji)` SIN `sender_jid`: el daemon (`SendReaction` en `internal/client/features.go` vía `BuildReaction`) lo exige en grupos, así que las reacciones a triggers grupales hoy fallarían.
- El daemon ya soporta borrado con emoji `""` (descripción de `send_reaction`).
- Las reacciones entrantes no tienen `Conversation`/`ExtendedTextMessage` (`extractTextContent` devuelve `""`), y el loop del watcher salta filas sin contenido ni media; los IDs propios los descarta anti-echo. Sin superficie de bucle.
- whatsmeow traceability: sin nuevas llamadas whatsmeow; `send_reaction`/`send_typing` son tools MCP existentes (sin `BuildPollCreation` ni `GetGroupInfo` involucrados).
- Comunidad (búsqueda Exa, 2 rondas): Baileys cita con `{ react: { key, text } }` y `""` borra; whatsmeow-node `sendReaction(jid, sender, id, emoji)` con `""` para quitar; typing auto-expira a los 25s o al responder y se refresca para tareas largas; la práctica es mostrar typing+acuse solo cuando la respuesta viene en camino y limpiar en `finally` (1 caso documentado reemplaza mensajes "⏳ Working" — imborrables en WhatsApp — por typing nativo + `paused` en finally).

## Goals / Non-Goals

**Goals:** 👀 al iniciar el turno + typing coexistiendo sin latencia extra; limpieza en `finally` en éxito y error; fail-open total; `senderJid` en reacciones grupales; suite del ciclo.

**Non-Goals:** reaccionar a mensajes que no disparan turno (escucha ambiental, trivia descartada); otros emojis o semánticas por tipo de turno; cambios al daemon Go; cambios de store o anti-echo.

## Decisions

1. **Montar 👀 + `presenceManager.start` juntos al abrir `processAiTurn`, limpiar en `finally` al cerrarlo.**
   Rationale: un solo punto de ciclo de vida cubre las 3 ramas de envío sin tocar cada una; el `finally` ya existe en espíritu (`presenceManager.stop` en cada salida) y se formaliza. Alternativa (montar por rama): rechazada — triple punto de fallo y divergencia.

2. **Helper `ackTurn(chatJid, msgId, senderJid, isGroup)` en el watcher (o `mcp-client.js`) con `Promise.allSettled` para reacción+typing.**
   Rationale: concurrentes para no sumar RTTs; `allSettled` (no `all`) para que el fallo de uno no cancele el otro — fail-open por construcción. Alternativa (secuencial): rechazada — retrasa la inferencia.

3. **Extender `sendReaction(recipient, messageId, emoji, senderJid='')` (parámetro opcional al final).**
   Rationale: retrocompatible (callers actuales sin cambios); en grupos pasa el sender del trigger, en 1:1 se omite per contrato del daemon. Alternativa (nueva función): rechazada — duplica superficie.

4. **Limpieza con `""` best-effort DENTRO del `finally`, sin reintentos.**
   Rationale: la limpieza es cosmética; un reintento ante daemon caído solo agrega latencia al apagado del turno. El huérfano residual (👀 sin quitar por caída total) se acepta y se documenta.

5. **Sin cambios a anti-echo ni al filtro del loop.**
   Rationale: evidencia en código — `extractTextContent` devuelve `""` para reacciones y el watcher salta `!content && !isMedia`; no hay nada que filtrar adicionalmente. Alternativa (filtro explícito de reactions): rechazada — código muerto defensivo.

## Risks / Trade-offs

- [Daemon caído al montar] → `allSettled` + log discreto; el turno sigue (fail-open).
- [Mensaje efímero/expirado rechaza la reacción] → Mismo camino fail-open; la respuesta igual llega.
- [👀 huérfano si el proceso muere entre mount y finally] → Aceptado: cosmético, una reacción sin quitar; el siguiente reinicio no lo limpia (sin barrido; fuera de alcance).
- [Doble 👀 por ráfagas coalescidas] → El turno cita el último mensaje de la ráfaga; la reacción monta sobre ese mismo `lastMsg.id`, así que hay un solo target por turno.
- [Saturación del daemon] → Reacción+typing son 2 calls concurrentes por turno (no por mensaje), igual orden de magnitud que el `sendTyping` periódico ya existente.

## Migration Plan

1. Deploy: helper + montaje/limpieza en `processAiTurn`, parámetro `senderJid`, suite nueva; reinicio del watcher vía launchd (`kickstart -k`); sin migración de BD.
2. Rollback: revert + reinicio vía launchd; daemon Go intacto (sin re-pair, sin rebuild).

## Open Questions

- Ninguna que bloquee: el umbral ">500ms" se implementa como montaje incondicional al abrir el turno (más simple que medir; el costo de una reacción es despreciable frente a la inferencia).
