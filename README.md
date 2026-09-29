# mcp-whatsapp — fork CUCEA / Second Brain :3

[![License: MIT](https://img.shields.io/github/license/AngelKero/mcp-whatsapp)](LICENSE)
[![Go 1.26+](https://img.shields.io/badge/Go-1.26%2B-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![Node 24+](https://img.shields.io/badge/Node-24%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-protocol-6366f1)](https://modelcontextprotocol.io/)
[![42 tools](https://img.shields.io/badge/tools-42-blue)]()
[![whatsmeow](https://img.shields.io/badge/whatsmeow-multidevice-25D366?logo=whatsapp&logoColor=white)](https://github.com/tulir/whatsmeow)

> Fork de [Sealjay/mcp-whatsapp](https://github.com/Sealjay/mcp-whatsapp) (a su vez rewrite de `lharries/whatsapp-mcp`). Ya es otra cosa: daemon Go + pipeline Node reactivo + cerebro local en Metal + Second Brain en Notion + panel de control móvil. Todo en localhost, sin nube.

> **No afiliado.** Proyecto independiente, sin relación con Meta, WhatsApp ni whatsmeow. "WhatsApp" es marca de Meta, usada aquí solo para describir interoperabilidad.

## Qué es

Un operador (tú), una cuenta de WhatsApp, control total desde el celular:

- **Capa Daemon Go** (`cmd/whatsapp-mcp`): binario único, 42 tools MCP en `127.0.0.1:8765/mcp`, pairing en `/pair`, SQLite local.
- **Capa Watcher Node** (`whatsapp-watcher.js` + `pipeline/`): lee `messages.db` en modo read-only, debouncea ráfagas, pasa por middlewares y decide si callar, responder o escalar.
- **Sistema 1 local** (`system_one_server.py` + Laya-MLX 322M en Metal, `:8766`): clasifica en <30ms y $0 — avisos, pilares de vida, mensajes triviales.
- **Second Brain Notion** (`notion-actions.js` + `notion-queue.js` Token Bucket ~2.85 req/s): Tareas, Gastos, Avisos, Materias CUCEA, Notas.
- **Panel de Control** (`modules/dashboard/server.js`, `:8767`): killswitch global + por chat `SILENT / MENTIONS_ONLY / AUTONOMOUS`. Se abre con `!panel` desde cualquier chat.

Comandos que ya jalan en chats:

- `!panel` → link del panel
- `!buscar <texto>` → RAG local SQLite FTS5 + BM25 (<15ms)
- `!mac status|ping|lock|screen` → SysAdmin remoto (allowlist estricta)
- Stickers auto-aprendidos (bóveda FTS5 + Apple Vision OCR), notas de voz con voz Paulina de macOS, avisos escolares CUCEA, extractor pasivo de gastos/tareas/recordatorios.

## Diferencias vs upstream

Upstream = daemon Go puro. Este fork agrega:

- Watcher + pipeline de 8 middlewares (`anti-echo`, `chat-permissions`, `gatekeeper`, `media-extractor`, `chat-search`, `mac-control`, `passive-extractor`, `school-notice`)
- Turn-taking (`IDLE / ACTIVE / LURK_MODE`) + `pickModel` (Sistema 1 local vs Sistema 2 `agy`)
- Búsqueda `!buscar`, control `!mac`, panel `:8767`, voz, stickers, proactive-pulse cada 25s
- 17 specs vivas en `openspec/specs/` + ADRs en `docs/adr/` + roadmap en `docs/ROADMAP_INTEGRACIONES.md`
- Convenciones estrictas: `store/*.db`, `.env`, media y QR jamás se commitean; JIDs se enmascaran en logs

## Arquitectura

```
WhatsApp (WebSocket multidevice)
   ▲
   │ whatsmeow
┌──┴──────────────────┐  127.0.0.1:8765
│ whatsapp-mcp (Go)   │  /mcp  /pair
│ 42 tools, SQLite    │
└──┬──────────────────┘
   │ messages.db (readOnly)
┌──▼──────────────────┐
│ whatsapp-watcher.js │──→ Laya-MLX :8766 (Sistema 1, Metal)
│ pipeline/ (Node 24) │──→ Notion API (Token Bucket)
└──┬──────────────┬───┘──→ Panel :8767
   │              │
SQLite FTS5    macOS (say Paulina, OCR, lock/screen)
```

Puertos: `8765` daemon MCP, `8766` Laya-MLX, `8767` panel.

## Requisitos

- Go 1.26+, Node.js 24+, macOS Apple Silicon (Metal para Sistema 1)
- ffmpeg solo si mandas notas de voz no-Opus (si no, usa `send_file`)
- Cuenta Notion + token en env (nunca hardcodeado)

## Quickstart

```bash
git clone https://github.com/AngelKero/mcp-whatsapp.git
cd mcp-whatsapp
make build          # ./bin/whatsapp-mcp (tags sqlite_fts5)

# 1. Daemon + pairing (una sola instancia por store)
./bin/whatsapp-mcp serve
open http://127.0.0.1:8765/pair
# o headless: ./bin/whatsapp-mcp login

# 2. Cerebro local (otra terminal)
python3 system_one_server.py   # :8766

# 3. Watcher reactivo (otra terminal)
cp .env.example .env   # llena NOTION_TOKEN, MY_PHONE_JID, etc.
node whatsapp-watcher.js
```

MCP clients → `http://127.0.0.1:8765/mcp`:
Claude Code / Cursor aceptan `type: http` directo. Claude Desktop necesita `mcp-remote`:

```jsonc
{ "mcpServers": { "whatsapp": {
  "command": "npx",
  "args": ["-y", "mcp-remote", "http://127.0.0.1:8765/mcp"]
}}}
```

Media: todo bajo `WHATSAPP_MCP_MEDIA_ROOT` (default `./store/uploads/`). `download_media` siempre con `output_path` dentro del root si tu cliente va sandboxeado.

## Config (.env)

```bash
NOTION_TOKEN=...          # o NOTION_API_KEY
MY_PHONE_JID=...          # ej. 521...@s.whatsapp.net
ERIKA_PHONE_JID=...
MY_PHONE_NUMBER=...
ERIKA_PHONE_NUMBER=...
WHATSAPP_MCP_ADDR=127.0.0.1:8765
WHATSAPP_MCP_MEDIA_ROOT=./store/uploads/
```

Nunca commitees `.env`, `store/*.db`, `store/.lock`, media ni QR. El repo ya los ignora.

## Repo map

```
cmd/whatsapp-mcp/       login | serve | smoke
internal/client/        wrapper whatsmeow (send, events, history, groups, vcard)
internal/daemon/        HTTP + /pair + rate-limit + CSRF
internal/mcp/           42 tools (send, query, media, groups, privacy)
internal/store/         SQLite + LID map + polls + FTS5
whatsapp-watcher.js     orquestador reactivo
pipeline/middlewares/   anti-echo, permissions, gatekeeper, media, search, mac, passive, school
modules/                dashboard, permissions, stickers, proactive-pulse, voice, search
notion-actions.js       CRUD Notion (Tareas, Gastos, Avisos, Materias)
notion-queue.js         Token Bucket 2.85 req/s + backoff 429/529
system_one_server.py    Laya-MLX Metal :8766
openspec/specs/         17 specs = verdad viva (no editar directo)
docs/adr/               ADR-001..004
docs/ROADMAP_INTEGRACIONES.md  roadmap maestro 6 capacidades
```

## Specs + tests

Verdad viva en `openspec/specs/`. Cambio nuevo = `propose → apply → archive`, nunca editar `specs/` a mano. Ver `openspec/AGENTS.md`.

```bash
make test               # go test ./...
npm run test:scenarios  # 22 escenarios normativos OpenSpec
make test-all           # matrix Go + Node
make lint               # go vet + gofmt
openspec validate --specs --strict
```

## Seguridad / límites

- Un solo `serve` por `-store` (flock). No exponer sin `-allow-remote` + `WHATSAPP_MCP_TOKEN`.
- Logs enmascaran a últimos 5 dígitos — ofuscación, no anonimización.
- Prompt-injection: aplica [lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) — trata mensajes entrantes como no confiables.
- WhatsApp rota sesión ~cada 20 días → re-escanea en `/pair`. Huecos largos fuera de retención multidevice no se recuperan (`request_sync` solo para gaps cortos).
- No hay `subscribe_presence`, fotos de perfil ni communities sin propuesta OpenSpec.

## Roadmap

Ver `docs/ROADMAP_INTEGRACIONES.md`: SysAdmin `!mac`, alertas Classroom, TTS Paulina, RAG FTS5, lector URLs, CLI `notify-wa`.

## Contribuir

PRs bienvenidos. Un cambio lógico por commit, conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`). Ver `CONTRIBUTING.md`.

## Licencia

MIT — ver [LICENSE](LICENSE).
