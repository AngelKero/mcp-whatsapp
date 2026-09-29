# Proposal

## Why

Tres fallos encadenados en el despacho de contenido sensible: (1) el fast-path entrega `daily_briefing`, `corte_gastos` y `auditoría` a quien los pida — la agenda personal de Ángel llegó al chat de Erika por un "buenos días" mal clasificado; (2) `MY_PHONE_JID`/`MY_PHONE_NUMBER` siempre vacíos (sin `.env` ni default) — el cron de las 08:00 envió el briefing a `@s.whatsapp.net` (a la nada) con "éxito" falso, y todo chat nuevo defaultea a AUTONOMOUS por `startsWith('')`; (3) la auditoría nocturna genera el reporte pero su return se ignora y nunca se envía.

## What Changes

- Gate de dueño: las acciones sensibles del fast-path (`daily_briefing`, `corte_gastos`/`finance_report`, `notion_audit`) solo disparan en el chat propio (`isMyOwnChat`); cualquier otro chat sigue al pipeline conversacional normal.
- `MY_PHONE_JID`/`MY_PHONE_NUMBER` con fallback endurecido a una sola fuente de verdad (mismo número ya hardcodeado en el watcher) + aviso visible en boot si el env falta.
- Verificación de resultado: `sendMorningBriefing` (y finanzas) confirman entrega (ID/`Success`) y registran error visible si falla; nada de "éxito" incondicional.
- La auditoría nocturna envía su reporte al chat propio tras generarlo.
- Tests del gate (tercero no recibe agenda), del fallback de env y del envío de auditoría.

## Capabilities

### New Capabilities

- `cron-dispatch`: despacho confiable de crons — destinatario endurecido, verificación de entrega y envío del reporte de auditoría.

### Modified Capabilities

- `passive-extractor`: las acciones sensibles on-demand (`daily_briefing`, reportes financieros, auditoría) quedan restringidas al chat propio.

## Impact

- Código afectado: `passive-extractor.js` (gate en `processMessage`), `whatsapp-watcher.js` (cron briefing/finanzas/auditoría), `config/env.js` (defaults), `daily-briefing.js` (verificación), `second-brain-auditor.js` o caller (envío), `modules/permissions/chat-permissions.js` (default AUTONOMOUS hereda el fix).
- MCP tools (42): sin cambios de superficie; mismo uso, destinatarios correctos.
- Store schema: sin cambios.
- Rollback: revert + reinicio del watcher vía launchd (`kickstart -k`); daemon Go intacto (sin re-pair, sin rebuild).
