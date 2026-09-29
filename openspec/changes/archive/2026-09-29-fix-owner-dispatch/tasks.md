# Tasks

## 1. Gate de dueño en acciones sensibles

- [x] 1.1 Gatear `daily_briefing`, `finance_report`/`corte_gastos` y `notion_audit` en `passive-extractor.js` (`processMessage`) a chat propio (`isMyOwnChat`); terceros fluyen a manejo conversacional sin generar reporte, y verificar con test que `buenos días amorcito` de un tercero no dispara briefing.
- [x] 1.2 Añadir pre-filtro determinista saludo-vs-briefing (petición explícita de agenda/briefing requerida) y verificar con test que `buenos días` solo no dispara y `dame mi agenda de hoy` sí.

## 2. Identidad del dueño endurecida

- [x] 2.1 Centralizar fallback de `MY_PHONE_JID`/`MY_PHONE_NUMBER` en `config/env.js` (misma fuente que los hardcodes existentes) + warn visible en boot si el env falta, y verificar que `defaultAutonomyMode` ya no defaultee todo a AUTONOMOUS y que los crons resuelvan destinatario no vacío.

## 3. Entrega verificada

- [x] 3.1 `sendMorningBriefing` y reporte dominical confirman entrega (ID/`Success`) y fallan visible si no; el cron solo marca el día tras confirmación, y verificar con test mockeado ambos caminos.
- [x] 3.2 El caller nocturno envía `reportData.whatsappMessage` al chat propio tras `runFullAudit` (log visible si vacío/falla) y verificar con test.

## 4. Suites y validación

- [x] 4.1 Correr `npm run test:scenarios` y `npm run test:unit` completos y verificar cero regresiones (los 3 fallos preexistentes de `chat-permissions.test.js` documentados aparte, no cuentan).
- [x] 4.2 Correr `make vet` limpio y `openspec validate fix-owner-dispatch --strict` con cero errores antes de archivar.
