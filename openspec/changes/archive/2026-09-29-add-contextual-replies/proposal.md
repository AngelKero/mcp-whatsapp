# Proposal

## Why

Hoy el observador responde a comandos y detonadores directos con mensajes flotantes (`send_message`) en chats 1:1 y solo cita (`send_reply`) en grupos. Sin cita, el usuario no ve a qué mensaje responde el bot — confuso en ráfagas o cuando hay latencia entre pregunta y respuesta. Ninguna spec vigente gobierna esta política (ai-turn-taking solo exige "responder amablemente").

## What Changes

- El contexto del pipeline propaga `message_id` (stanzaId) y `chat_jid` del mensaje detonador a través de todos los middlewares.
- Nuevo contrato de despacho: al contestar a un comando o detonador directo, el watcher invoca la herramienta MCP `send_reply` citando el mensaje original por defecto — en grupos y en 1:1 con terceros. El chat propio note-to-self queda flotante (fijado por test normativo existente).
- Fallback automático a `send_message` estándar cuando no hay `message_id` (p.ej. notificaciones proactivas, cron, avisos del panel) o cuando la cita falla (referencia inválida/expirada).
- Las notificaciones no solicitadas (briefing, reportes, auditoría, propuestas a MY_PHONE_JID) siguen flotantes: solo cambia la respuesta directa a un mensaje del usuario.
- Escenarios normativos en `tests/` que validan el payload del reply y la resiliencia del fallback.

## Capabilities

### New Capabilities

- `contextual-replies`: política de respuesta contextual — propagación de stanzaId/chat_jid, `send_reply` por defecto ante comandos y detonadores directos, y fallback a `send_message`.

### Modified Capabilities

(none — ninguna spec existente describe flotante vs. citado; el cambio añade el contrato sin alterar el contenido de las respuestas.)

## Impact

- Código afectado: `whatsapp-watcher.js` (`processAiTurn` + ramas fast-path/gatekeeper: `sendMessage(chatJid,…)` → reply-aware), `pipeline/middlewares/` (chat-search, mac-control, chat-memory `say()`, gatekeeper-bye; media-extractor ya cita; chat-permissions ya bifurca propio/grupo), `mcp-client.js` (helper `sendReplyOrFallback`), `pipeline/message-pipeline.js` (campos del contexto, sin cambio de firma).
- MCP tools (42): sin cambios de superficie; solo cambia el uso: más llamadas a `send_reply`, menos a `send_message`. Sin `subscribe_presence` ni surface diferida.
- Store schema: sin cambios (no nuevas tablas; anti-echo sigue registrando por firma+ID igual en ambas rutas).
- Rollback: revert del cambio + reinicio del watcher vía launchd (`kickstart -k`); sin migración que deshacer, sin re-pair (daemon Go intacto).
