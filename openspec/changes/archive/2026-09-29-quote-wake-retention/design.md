# Design

## Context

See proposal.md (Why) and `specs/quote-wake-retention/spec.md`. Observed in repo:

- `AntiEchoTracker` (`modules/anti-echo-tracker.js`) owns `sentIdsTtlMs = 24h`, `sent_messages` in `store/anti-echo.db`, in-memory `sentIdsCache` (1000 precargados), and `hasSentId()` (caché → SELECT indexado → false). La purga corre en `evict()` en cada escritura.
- `messages` en `store/messages.db` tiene PK `(id, chat_jid)` (autoindex; `id` es columna izquierda, lookup por id usa índice) y guarda todos los salientes con `is_from_me=1` sin purga.
- El wake (`isQuotedToBot` en `whatsapp-watcher.js` → ACTIVE directo en gatekeeper) no cambia.
- whatsmeow traceability: sin llamadas whatsmeow; solo SQLite local (sin `BuildPollCreation` ni `GetGroupInfo` involucrados).

## Goals / Non-Goals

**Goals:** TTL caliente a 7 días; fallback indexado a `messages.db` para citas viejas; fail-open si el historial no abre; tests del ciclo.

**Non-Goals:** cambiar el flujo de despertar, el guard de reacciones puras, la purga existente (solo su umbral), nuevas tablas o MCP tools.

## Decisions

1. **TTL 7 días, no infinito.**
   Rationale: la vía caliente sigue acotada (una semana de IDs ≈ miles de filas, trivial) y la purga oportunista conserva su propósito anti-eco. Lo infinito vive en `messages.db`, que ya es infinito. Alternativa (TTL infinito en `sent_messages`): rechazada — duplica retención sin necesidad.

2. **Fallback con handle propio read-only y perezoso a `messages.db`.**
   Rationale: el tracker no debe compartir el handle de escritura del watcher ni abrir el historial en arranque; el handle se crea al primer fallback miss y se reutiliza. Query: `SELECT 1 FROM messages WHERE id=? AND is_from_me=1 LIMIT 1`. Alternativa (ATTACH al anti-echo.db): rechazada — acopla dos BDs con distintos modos WAL/lock.

3. **Sin warming de caché con el fallback.**
   Rationale: los IDs viejos se citan rara vez; añadirlos a `sentIdsCache` (Set sin cota por ID) crecería sin control. El lookup indexado (~sub-ms) es suficientemente barato para repetirlo.

4. **Fail-open en cada capa.**
   Rationale: si `messages.db` está bloqueado o ausente, el fallback devuelve false y el turno sigue el pipeline normal — idéntico a hoy. El despertar mejora cuando puede, nunca empeora.

## Risks / Trade-offs

- [WAL-lock en `messages.db` durante el fallback] → Handle read-only + query puntual; en `busy` se captura y devuelve false (comportamiento actual).
- [ID citado de otro chat] → El lookup no filtra por chat a propósito: un ID es globalmente único (WhatsApp IDs con sufijo de dispositivo propio); si el bot lo mandó en cualquier chat, despertar es correcto.
- [Mensajes propios viejos purgados de `messages.db`] → No hay purga en esa tabla; retención efectiva = vida del archivo.

## Migration Plan

1. Deploy: un cambio en `anti-echo-tracker.js` + tests; reinicio del watcher vía launchd (`kickstart -k`); sin migración de BD (el TTL nuevo aplica en la siguiente purga oportunista).
2. Rollback: revert + reinicio vía launchd.

## Open Questions

- Ninguna que bloquee.
