# Design

## Context

See proposal.md (Why) and `specs/contextual-replies/spec.md`. Observed in repo:

- Respuesta dual actual: `if (isMyOwnChat || !isGroup) sendMessage else sendReply` repetido en `processAiTurn` (fast-path, gatekeeper quick replies, AI reply + su fallback), `gatekeeper` (bye), `mac-control`, `chat-search`, `media-extractor`, `chat-permissions` (panel link). `passive-extractor` siempre usa `sendMessage` flotante.
- `mcp-client.js` expone `sendMessage(recipient, message)` y `sendReply(chatJid, body, targetMessageId, targetSenderJid='')` sin fallback entre ellos; ambos registran firma+ID en anti-echo.
- El contexto del pipeline ya lleva `msg` (fila completa con `id`), `chatJid`, `sender`, `isGroup`; el trigger siempre está a mano, solo falta usarlo en 1:1.
- whatsmeow traceability: el cambio no añade llamadas whatsmeow; `send_reply`/`send_message` son las 2 herramientas MCP existentes que el daemon ya traduce a mensajes de protocolo (sin `BuildPollCreation` ni `GetGroupInfo` involucrados).

## Goals / Non-Goals

**Goals:** un helper único de despacho con fallback; citar por defecto en respuestas directas (1:1 y grupos); flotantes intactos para notificaciones; tests del payload y del fallback.

**Non-Goals:** citar notificaciones proactivas; citar mensajes del propio bot (anti-echo); cambiar el contenido/tono de ninguna respuesta; nuevos MCP tools; cambios de store.

## Decisions

1. **Helper `sendReplyOrFallback(chatJid, body, { messageId, senderJid, isGroup })` en `mcp-client.js`.**
   Rationale: un solo punto con la política (reply si hay id → catch → `send_message` + log `reply-fallback`) en vez de N `if/else` dispersos. Alternativa (repetir try/catch por call-site): rechazada — ya hay 3+ copias del patrón dual y divergen.

2. **Target = último mensaje de la ráfaga (`lastMsg.id` / `ctx.msg.id`), sender solo en grupos.**
   Rationale: respeta el contrato documentado de `send_reply` (sender requerido en grupos, omitido en 1:1) y evita el error de restricción del daemon. Alternativa (siempre mandar sender): rechazada — el daemon lo rechaza/falla en 1:1.

3. **El fallback reintenta exactamente una vez y entrega exactamente un mensaje.**
   Rationale: evita dobles envíos si el primer intento en realidad sí llegó (el catch solo entra cuando `callTool` lanza o el payload trae error). Alternativa (reintentos múltiples): rechazada — riesgo de duplicados visibles.

4. **Alcance: respuestas directas sí; `passive-extractor` (notificaciones Notion) y crons no.**
   Rationale: esas rutas no tienen trigger del usuario (o el trigger vive en otro chat); citar sería confuso o inválido. `passive-extractor` conserva `sendMessage` a propósito. Alternativa (citar todo): rechazada — viola el requisito de flotantes proactivos.

5. **Sin cambios a `message-pipeline.js`: el contexto ya propaga `msg/chatJid/sender`.**
   Rationale: `ctx.msg.id` + `ctx.chatJid` ya atraviesan la cadena; solo se documenta el contrato en la spec. Alternativa (nuevos campos `triggerId`): rechazada — duplicaría lo existente.

## Risks / Trade-offs

- [Cita a mensaje expirado/eliminado] → El daemon rechaza → fallback a `send_message` + log; el usuario recibe el contenido de todos modos.
- [Doble envío si el reply llegó pero la respuesta se perdió] → Mitigado con un solo reintento y registro de ID en anti-echo en ambas rutas.
- [`isMyOwnChat` (note-to-self): se queda flotante] → Pinneado por `chat-permissions.test.js` (el link del panel en chat propio usa `sendMessage`); además las auto-citas exigen resolución especial de `Participant` al JID propio. Sin excepción.
- [Tap a la cita en 1:1 puede decir "Message not found" (quirk cosmético de cliente, el envío sí llega)] → Riesgo aceptado y documentado; en grupos el tap funciona. Si el quirk molesta, el fallback manual es `!olvidar`-style: reintentar la pregunta (nuevo trigger, nueva cita).
- [Participant con LID rompe el tap-to-scroll (el `remoteJid` debe ser JID teléfono)] → Ya cubierto: el daemon resuelve `@lid` vía `whatsmeow_lid_map` antes de armar el `ContextInfo`; el watcher solo pasa `senderJid` y el contrato `send_reply` lo exige únicamente en grupos.
- [Latencia +1 RTT solo cuando falla el reply] → El caso feliz mantiene un solo `callTool`.

## Migration Plan

1. Deploy: helper + reemplazo de call-sites en respuestas directas; reinicio del watcher vía launchd (`kickstart -k`); sin migración de BD.
2. Rollback: revert + reinicio vía launchd; daemon Go intacto (sin re-pair).

## Open Questions

- Ninguna que bloquee: el presupuesto de "exactamente un mensaje" se verifica en tests con `send_reply` mockeado en fallo.
