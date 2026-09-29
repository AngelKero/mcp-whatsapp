# Tasks

## 1. Helper de despacho con fallback

- [x] 1.1 Implementar `sendReplyOrFallback(chatJid, body, { messageId, senderJid, isGroup })` en `mcp-client.js` (reply si hay id con sender solo en grupos; catch → un `send_message` + log `reply-fallback`; exactamente un mensaje entregado) y verificar con test que el orden de `callTool` es `send_reply` y que ante fallo llama `send_message`.
- [x] 1.2 Verificar que ambas rutas registran firma+ID en anti-echo (sin auto-respuestas en chat propio) con test dedicado.

## 2. Migración de call-sites directos

- [x] 2.1 Migrar `processAiTurn` en `whatsapp-watcher.js` (fast-path Notion, quick replies del gatekeeper, respuesta IA; target `lastMsg.id`) a `sendReplyOrFallback` y verificar que en 1:1 la respuesta llega citada.
- [x] 2.2 Migrar `gatekeeper` (bye), `mac-control`, `chat-search`, `chat-memory` (`say()`) (target `ctx.msg.id`) al helper y verificar que el payload lleva `target_message_id` y `target_sender_jid` solo en grupos, y que el chat propio (`isMyOwnChat`) sigue flotante sin intentar cita.
- [x] 2.3 Dejar `passive-extractor`, crons (briefing/finanzas/auditoría) y reenvíos a MY_PHONE_JID en `send_message` flotante y verificar con test que no intentan cita.

## 3. Escenarios normativos

- [x] 3.1 Añadir `test/unit/contextual-replies.test.js` (referencia propagada en la cadena, cita en 1:1 y en grupo con sender, chat propio flotante sin intento de cita, fallback sin id, fallback ante `send_reply` roto con un solo reintento, proactivas flotantes) y verificar con `node --test test/unit/contextual-replies.test.js`.
- [x] 3.2 Correr `npm run test:scenarios` y `npm run test:unit` completos y verificar cero regresiones (los 3 fallos preexistentes de `chat-permissions.test.js` documentados aparte, no cuentan).

## 4. Validación final

- [x] 4.1 Correr `make vet` limpio y `grep -rn "subscribe_presence\|profile-photo\|communities" internal/mcp/` vacío (parity: 42 tools sin cambios) y verificar salida.
- [x] 4.2 Validar con `openspec validate add-contextual-replies --strict` y verificar cero errores antes de archivar.

## 5. Fix daemon send_reply (hallazgo en vivo)

- [x] 5.1 `SendReply` en `internal/client/features.go`: Participant siempre (sender LID-resuelto en grupos, chat JID en 1:1), `QuotedMessage` pelado desde caché local, y `persistSent` del reply (antes invisible en `list_messages`).
- [x] 5.2 `gofmt`+`go vet` limpios, `go test ./internal/...` verde, `make build`, restart del daemon vía launchd y sonda viva `send_reply` en chat propio verificada en caché.
