---
trigger: always_on
description: Orientación arquitectónica, contratos OpenSpec y decisiones ADR para mcp-whatsapp.
---

# Orientación del Ecosistema `mcp-whatsapp`

Este repositorio opera en dos capas desacopladas:

1. **Capa Daemon Go (`whatsapp-mcp`)**:
   - Binario único que envuelve `go.mau.fi/whatsmeow`.
   - Expone 42 herramientas MCP en `127.0.0.1:8765/mcp` y UI de vinculación QR en `/pair`.
   - Persiste en `store/messages.db` y `store/whatsapp.db` protegiendo la exclusión mutua con `store/.lock`.

2. **Capa Observador & Pipeline Node.js (`whatsapp-watcher.js`, `pipeline/`)**:
   - Orquestador reactivo de eventos multimodales en Node.js 24 (`messages.db` en solo lectura).
   - Inferencia local en GPU Metal con Laya-MLX (`system_one_server.py`, `localhost:8766`, 322M, <30ms, $0 costo).
   - Búsqueda RAG local en <15ms con SQLite FTS5 (`!buscar`).
   - SysAdmin y control de macOS vía `!mac` (`mac-control`).
   - Síntesis de voz nativa en macOS (voz Paulina de `say`) transcodificada a WhatsApp Opus PTT.
   - Second Brain en Notion regulado por Token Bucket Queue (`notion-queue.js`) a ~2.85 req/s.

## Directrices para Agentes Antigravity

- **Fuente de Verdad**: Las 17 especificaciones activas en [`openspec/specs/`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/). Nunca edites especificaciones directamente; utiliza siempre el ciclo OpenSpec (`openspec new change`, `validate`, `archive`).
- **Racionalidad Arquitectónica**: Antes de realizar refactors o sugerir cambios de arquitectura, consulta los Architecture Decision Records en [`docs/adr/`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/docs/adr/) (ADR-001 al ADR-004) para evitar regresiones en inferencia local, concurrencia SQLite, voz o cuotas de Notion.
- **Verificación**: Ejecuta siempre `make test-all` (22 escenarios normativos en Node.js + suite completa en Go) y `make lint` antes de entregar cambios.
- **Grafo de Conocimiento**: Consulta `graphify-out/` o corre `make graph-update` para mantener sincronizados los más de 5,900 nodos y 326 comunidades de código.
- **Seguridad**: Jamás termines demonios activos de producción ni alteres bases de datos activas en `store/`.
