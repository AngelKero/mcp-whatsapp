---
name: whatsapp-dev
description: Develop the WhatsApp MCP daemon (build, serve, pair, history sync). Use when editing Go code, running the daemon, pairing, or debugging store/LID/media paths.
---

## What I do

- Build/test loop for this Go binary.
- Daemon lifecycle: `login` vs `serve` vs `smoke`.
- Store, LID, media-allowlist guidance.

## When to use me

Use when touching `cmd/`, `internal/`, `Makefile`, or `store/` behavior.

## Instructions

1. Prefer `make build && make vet` before `make test`.
2. Never run two `serve` on same `-store` (flock). Use `make smoke` for boot-test without WhatsApp.
3. Pairing: `./bin/whatsapp-mcp login` (headless) or `serve` + `http://127.0.0.1:8765/pair`.
4. Store queries must handle `@lid` via `whatsmeow_lid_map` (`internal/store/lid.go`).
5. `media_path`/`output_path` must stay under `WHATSAPP_MCP_MEDIA_ROOT` (default `./store/uploads/`); resolve symlinks before check.
6. For history gaps: `list_messages` → `request_sync` per chat → re-query.
7. After arch-affecting edits: suggest `/graphify . --update` and `openspec validate --strict` if a change is active.
