# Proposal

## Why

Cada chat con el bot arranca de cero: si el usuario cambia de sesión o reinicia el watcher, se pierden preferencias, hechos y compromisos ya dichos en ese chat. El deep-research previo (RESEARCH-2026-09-29) muestra que el patrón estándar en otros bots es memoria destilada por `user_id` + ventana reciente + controles de opt-in, y que los usuarios esperan poder activar/desactivar y pedir explícitamente qué se recuerda.

## What Changes

- Nueva memoria persistente por chat (`chat-memory`): cada JID acumula hechos destilados (perfil, preferencias, compromisos) que sobreviven reinicios y se reinyectan al inicio de cada sesión/turno.
- Extracción automática post-respuesta: un middleware detecta información durable en el turno y la guarda (0–3 hechos por turno; si no hay nada durable, no escribe).
- Inyección pre-LLM: el prompt de cada turno combina ventana reciente verbatim + top-K hechos del JID bajo presupuesto de tokens.
- Controles en el panel existente (puerto 8767): toggle de memoria por chat, botón "Generar contexto" (bootstrap desde últimos N mensajes), vista de hechos con editar/borrar/limpiar.
- Comandos desde el propio chat: `!recordar <dato>`, `!olvidar <query|todo>`, `!memoria` (ver), `!reset-memoria` separado del reset de sesión existente.
- Bootstrap offline: lectura de `store/messages.db` (últimos 50 mensajes del JID) con extracción long-range una sola vez, idempotente y sin bloquear el hot path.

## Capabilities

### New Capabilities

- `chat-memory`: memoria factual persistente por chat con extracción, inyección, bootstrap, comandos de chat y aislamiento por JID/LID.

### Modified Capabilities

- `dashboard-panel`: añade controles de memoria por chat (toggle enabled, botón bootstrap, vista/edición de hechos) manteniendo todos los controles actuales (killswitch, modos, Notion/Media, reset IDLE, búsqueda, tabs, stats).

## Impact

- Código afectado: `whatsapp-watcher.js` (orden de middlewares), `pipeline/middlewares/chat-memory.middleware.js` (nuevo), `modules/dashboard/server.js` + SPA (nuevos endpoints `GET/PUT /api/chats/:jid/memory`, `POST /api/chats/:jid/memory/bootstrap`, `GET/DELETE /api/chats/:jid/memory/facts`), `store/messages.db` (nuevas tablas `memory_facts`, `memory_settings`, `memory_events`; reutiliza `messages` + `messages_fts` existentes).
- MCP tools (42): ninguno cambia. El bootstrap reutiliza el read path existente (`list_messages`/`request_sync`); la memoria vive en la capa watcher, no en el daemon Go. No se añade `subscribe_presence` ni surface diferida.
- Store schema: +3 tablas, migración forward-only con `IF NOT EXISTS`; sin cambios a `messages`, `chats`, `messages_fts` ni triggers.
- Dependencias: ninguna nueva en caliente (extracción vía `system-one-client.js`/Laya-MLX o `agy` ya existentes; sin Qdrant/Chroma en v1 — FTS5 + ranking recencia es suficiente).
- Rollback: desactivar toggle por chat o killswitch global (fail-open a sin-memoria); borrar filas de `memory_facts` por JID; restaurar `store/messages.db` desde backup; re-pair vía `/pair` o `login` si el daemon se tocó (no se toca en este cambio).
