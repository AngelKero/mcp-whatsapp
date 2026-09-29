# Proposal

## Why

Citar un mensaje del bot despierta al observador (va directo a ACTIVE sin inferencia previa), pero solo si la cita es reciente: `sent_messages` se purga a las 24h (`sentIdsTtlMs` en `anti-echo-tracker.js`), así que una cita a un mensaje del bot de hace días cae al pipeline normal y depende de suerte (mención, modo del chat, Laya). El despertar por cita debe funcionar sin importar la antigüedad, manteniendo su costo actual O(1) sin inferencia.

## What Changes

- `hasSentId` gana fallback: si el ID no está en `sent_messages` (purgado o fuera de los 1000 precargados), una segunda búsqueda indexada en `messages` (`WHERE id=? AND is_from_me=1`) confirma "ese mensaje lo mandé yo" con retención efectiva infinita.
- `sentIdsTtlMs` sube de 24h a 7 días: la vía caliente cubre la semana (eco + despertar rápido), la vía fría (`messages.db`) cubre todo lo anterior.
- Sin cambios en el flujo de despertar (`isQuotedToBot` → ACTIVE directo), en la purga existente ni en el guard de reacciones puras (`jaja`/`xd` citando al bot siguen sin despertar).
- Tests del fallback con IDs purgados/antiguos y del TTL nuevo.

## Capabilities

### New Capabilities

- `quote-wake-retention`: despertar por cita al bot con retención extendida — TTL de 7 días en vía caliente más fallback a historial propio para citas de cualquier antigüedad.

### Modified Capabilities

(none — ninguna spec vigente describe el despertar por cita ni el TTL de `sent_messages`; el contrato es nuevo.)

## Impact

- Código afectado: `modules/anti-echo-tracker.js` (`sentIdsTtlMs`, `hasSentId` + fallback con handle read-only a `messages.db`), `test/unit/` (casos nuevos, p.ej. extender `ack-reactions.test.js` o archivo dedicado).
- MCP tools (42): sin cambios. Daemon Go intacto (sin rebuild ni re-pair).
- Store schema: sin cambios (solo lecturas; la purga existente sigue igual salvo el umbral).
- Rollback: revert + reinicio del watcher vía launchd (`kickstart -k`); sin migración que deshacer.
