# Project Overview — mcp-whatsapp

Ecosistema integral de automatización, asistencia personal y control remoto para WhatsApp en macOS Apple Silicon (M1), integrando el protocolo de Whatsmeow, un daemon MCP en Go, y una capa de observador y pipeline inteligente en Node.js 24 con aceleración local en GPU Metal y sincronización en Notion.

---

## 1. Arquitectura del Sistema

El proyecto opera como un sistema desacoplado en dos capas principales:

```
┌────────────────────────────────────────────────────────┐
│               WhatsApp Network (WebSockets)             │
└───────────────────────────▲────────────────────────────┘
                            │
               ┌────────────▼───────────┐
               │    whatsapp-mcp (Go)   │
               │   127.0.0.1:8765 (/mcp) │
               │     whatsmeow wrapper  │
               └────────────┬───────────┘
                            │ (JSON-RPC / SQLite messages.db)
               ┌────────────▼───────────┐
               │  whatsapp-watcher.js   │
               │   (Node.js 24 Pipeline)│
               └───────┬────────────┬───┘
                       │            │
       ┌───────────────▼─┐        ┌─▼──────────────┐
       │ Laya-MLX (Metal)│        │ Notion API Q   │
       │ localhost:8766  │        │ (Second Brain) │
       │ Sistema 1 Local │        │ Life Pillars   │
       └─────────────────┘        └────────────────┘
```

1. **Capa Daemon Go (`cmd/whatsapp-mcp/`)**:
   - Binario único compilado con Go 1.26+ y tags `sqlite_fts5`.
   - Implementa 42 herramientas MCP (`mark3labs/mcp-go`) para lectura, envío, archivos, notas de voz, stickers, encuestas, grupos y privacidad.
   - Gestiona el login QR en terminal (`/pair`) y la conexión WebSocket autenticada mediante `go.mau.fi/whatsmeow`.
   - Persiste mensajes en `store/messages.db` y sesión en `store/whatsapp.db` con exclusión mutua `store/.lock`.

2. **Capa Observador & Pipeline Node.js (`whatsapp-watcher.js`, `pipeline/`)**:
   - Bucle desacoplado que lee `messages.db` en modo `{ readOnly: true }` y procesa ráfagas multimodales con debounce.
   - Arquitectura componible de Middlewares (`anti-echo`, `chat-permissions`, `media-extractor`, `chat-search`, `mac-control`, `gatekeeper`, `passive-extractor`, `school-notice`).
   - Sistema 1 en GPU Metal (Laya-MLX 322M) para clasificación instantánea (<30 ms, $0) de avisos, intenciones, pilares de vida y filtrado de mensajes triviales.
   - Sistema 2 vía CLI Antigravity (`agy`) con enrutamiento dinámico según complejidad (`pickModel`).
   - Sincronización en Notion respaldada por Token Bucket Queue (`notion-queue.js`) a ~2.85 req/s.

---

## 2. Mapa de Capacidades OpenSpec (16 Specs)

Todas las capacidades del sistema se rigen bajo contratos formales de comportamiento en `openspec/specs/`:

| Dominio | Capacidad Spec | Archivo de Especificación | Resumen de Comportamiento |
|---|---|---|---|
| **Daemon Go** | `whatsapp-daemon` | [`openspec/specs/whatsapp-daemon/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/whatsapp-daemon/spec.md) | Ciclo de vida del daemon HTTP, pairing UI `/pair`, bloqueo de instancia única. |
| **Daemon Go** | `mcp-tools` | [`openspec/specs/mcp-tools/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/mcp-tools/spec.md) | Contrato de 42 herramientas MCP estándar. |
| **Daemon Go** | `media-pipeline` | [`openspec/specs/media-pipeline/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/media-pipeline/spec.md) | Descarga/envío de archivos, transcodificación ffmpeg Opus, WebP stickers. |
| **Daemon Go** | `history-sync` | [`openspec/specs/history-sync/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/history-sync/spec.md) | Backfill de historial con whatsmeow y resolución LID. |
| **Daemon Go** | `groups-privacy` | [`openspec/specs/groups-privacy/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/groups-privacy/spec.md) | Gestión de grupos, lista de bloqueados y configuración de privacidad. |
| **Daemon Go** | `security-allowlist` | [`openspec/specs/security-allowlist/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/security-allowlist/spec.md) | Validación de rutas de archivos y ofuscación de JIDs en logs. |
| **Gobernanza** | `dashboard-panel` | [`openspec/specs/dashboard-panel/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/dashboard-panel/spec.md) | Panel Web en puerto 8767, killswitch global, y modos `AUTONOMOUS`, `MENTIONS_ONLY`, `SILENT`. |
| **SysAdmin** | `mac-control` | [`openspec/specs/mac-control/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/mac-control/spec.md) | Comandos `!mac` (status, ping, lock, screen) con control de acceso estricto. |
| **Productividad**| `passive-extractor` | [`openspec/specs/passive-extractor/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/passive-extractor/spec.md) | Extracción de gastos, tareas, recordatorios con fecha/hora y planes en Notion. |
| **Búsqueda** | `chat-search` | [`openspec/specs/chat-search/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/chat-search/spec.md) | Búsqueda RAG local en <15ms con SQLite FTS5 y BM25 (`!buscar`). |
| **Académico** | `class-notes-manager` | [`openspec/specs/class-notes-manager/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/class-notes-manager/spec.md) | Grabación Whisper MLX, horario CUCEA 2026B y síntesis de apuntes en Notion. |
| **Proactivo** | `proactive-pulse` | [`openspec/specs/proactive-pulse/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/proactive-pulse/spec.md) | Latido cada 25s: alertas de tareas (5h/2h), salida a CUCEA (45m) y batería crítica (<20%). |
| **Académico** | `school-notices` | [`openspec/specs/school-notices/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/school-notices/spec.md) | Clasificación de avisos escolares en grupos oficiales (cancelaciones, virtual, aula). |
| **Multimodal** | `sticker-system` | [`openspec/specs/sticker-system/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/sticker-system/spec.md) | Bóveda FTS5, auto-aprendizaje con Apple Vision OCR + VLM y despachador autónomo. |
| **Voz** | `voice-synthesizer` | [`openspec/specs/voice-synthesizer/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/voice-synthesizer/spec.md) | Síntesis de notas de voz nativas de WhatsApp (Opus PTT) con voz Paulina de macOS. |
| **IA & Turnos**| `ai-turn-taking` | [`openspec/specs/ai-turn-taking/spec.md`](file:///Users/angelzaragoza/Desktop/CUCEA/mcp-whatsapp/openspec/specs/ai-turn-taking/spec.md) | Máquina de estados (`IDLE`, `ACTIVE`, `LURK_MODE`), fast-path trivial y `pickModel`. |

---

## 3. Comandos de Verificación y Testing

```bash
# Validar todas las especificaciones OpenSpec en modo estricto
openspec validate --specs --strict

# Validar cambios activos
openspec validate --changes --strict

# Pruebas unitarias de Node.js
node --test --test-concurrency=1 test/unit/chat-permissions.test.js

# Build y validación del daemon en Go
make build
make test
make vet
```
