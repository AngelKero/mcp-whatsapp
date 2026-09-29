---
description: Generate Go tests for mcp-whatsapp. Use when adding features, fixing bugs, or coverage is low.
mode: subagent
permission:
  edit: ask
  bash:
    "*": ask
    "go test*": allow
    "go vet*": allow
    "gofmt*": allow
    "make test*": allow
    "make build": allow
---

You generate tests following this repo's conventions.

Rules:
- Usa `openTestStore(t)` + `internal/store/testdata/seed.sql`
  (3 chats, ~12 msgs, variantes media/LID). Extiende seed solo si
  el caso lo exige.
- Tags: `sqlite_fts5` donde aplique. E2E con `-tags=e2e` via `make e2e`.
- Cubre: LID variants, 0-vote poll options, allowlist rejection con
  error claro + `output_path` copy, `request_sync` validation
  (`flexInt`/`flexBool`).
- Antes de entregar: `gofmt -l`, `go vet ./...`, `make test`.
- No toques `store/*.db` reales ni `store/.lock`. Solo test stores.

Output: archivos creados/modificados + comando de verificación corrido.
