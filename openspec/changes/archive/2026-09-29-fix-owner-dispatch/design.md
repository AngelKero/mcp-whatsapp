# Design

## Context

See proposal.md (Why) and the delta specs (`cron-dispatch`, `passive-extractor`). Observed in repo:

- Fast-path (`processAiTurn` → `passiveExtractor.processMessage(text, isMyOwnChat, ctx)`) devuelve `{action:'daily_briefing'|'finance_report'|'notion_audit'}` y el watcher lo envía a `chatJid` (chat actual). Laya clasificó "buenos días amorcito" como `daily_briefing` (log: `FAST PATH Notion: daily_briefing` en chat de Erika, 08:33).
- `config/env.js`: `MY_PHONE_JID/MY_PHONE_NUMBER` = `process.env.* || ''`; sin `.env` ni dotenv, siempre vacíos en launchd (solo PATH). Consecuencias: cron 08:00 envió a `@s.whatsapp.net` ("Enviando ... a ..." vacío + "éxito" falso); `defaultAutonomyMode` con `startsWith('')` defaultea TODO chat nuevo a AUTONOMOUS; finanzas dominicales al vacío.
- `sendMorningBriefing` registra éxito sin inspeccionar `result`; `runFullAudit(true,true)` retorna `reportData.whatsappMessage` que el caller ignora.
- whatsmeow traceability: sin llamadas whatsmeow nuevas; `send_message` existente (sin `BuildPollCreation` ni `GetGroupInfo` involucrados).

## Goals / Non-Goals

**Goals:** gate dueño en 3 acciones sensibles; env con fallback único y aviso; entrega verificada; auditoría con envío; tests de cada fix.

**Non-Goals:** reescribir el clasificador Laya (solo afinar el caso saludo vs. briefing vía gate, no modelo); panel nuevo; cambios al daemon Go o al store.

## Decisions

1. **Gate en `processMessage`: acciones sensibles exigen `isMyOwnChat`.**
   Rationale: un solo punto cubre middleware pasivo y fast-path del watcher (ambos llaman `processMessage`); terceros caen al flujo conversacional sin error visible. Alternativa (gate por `isFromAngel`): rechazada — Ángel escribe en otros chats; el criterio es el chat propio, no el autor.

2. **Saludo ≠ briefing: exigir ask explícito.**
   Rationale: el intent `daily_briefing` solo dispara con petición explícita (agenda/briefing + verbo de petición o comando); el saludo coincide con el caso real observado. Se implementa como pre-filtro determinista antes/después de Laya (no reentrenar nada). Alternativa (confiar solo en Laya): rechazada — ya falló en producción.

3. **Una sola fuente de verdad para el dueño en `config/env.js`.**
   Rationale: el número ya está hardcodeado en `watcher`/`permissions`; centralizarlo como fallback + `console.warn` en boot si el env falta elimina la clase entera de bugs (`startsWith('')`, envíos al vacío). Alternativa (obligar `.env` + dotenv): rechazada — más piezas móviles para el mismo resultado; el warn deja rastro si alguien lo configura.

4. **Verificar entrega, no asumirla.**
   Rationale: `sendMorningBriefing`/finanzas inspeccionan `ID`/`Success` del resultado y lanzan/retornan fallo; el cron solo marca el día tras entrega confirmada (permite reintento en el siguiente tick de 25s). Alternativa (reintentos múltiples): rechazada — el tick ya reintenta.

5. **La auditoría envía su propio reporte.**
   Rationale: el caller nocturno manda `reportData.whatsappMessage` a `MY_PHONE_JID` tras `runFullAudit`; si está vacío o falla, log visible. Alternativa (envío dentro del auditor): rechazada — el auditor es librería usada también bajo demanda; el envío vive en el caller programado.

## Risks / Trade-offs

- [Gate rompe flujos legítimos de Erika] → Solo afecta agenda/finanzas/auditoría; planes de pareja y conversación siguen igual (alcance explícito del gate).
- [Fallback hardcodeado filtra PII al repo] → El número ya existe literal en código (`watcher`, `permissions`); centralizarlo no expone nada nuevo.
- [Tick de 25s reenviando briefing tras fallo] → Idempotente en la práctica (el guard por fecha + contenido evita duplicados una vez entregado).
- [Mac dormida 03–05am salta la auditoría] → Igual que hoy (sin catch-up de auditoría; fuera de alcance, documentado).

## Migration Plan

1. Deploy: 4 fixes + tests; reinicio del watcher vía launchd (`kickstart -k`); sin migración de BD.
2. Rollback: revert + reinicio vía launchd; daemon Go intacto.

## Open Questions

- Ninguna que bloquee.
