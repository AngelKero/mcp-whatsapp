---
trigger: always_on
description: Go daemon conventions for mcp-whatsapp (fallback pointer if over budget).
---

# Go conventions (always on)

- `make build` uses `-tags sqlite_fts5`; keep `gofmt` clean.
- Thin wrappers over whatsmeow: protocol/auth/decrypt bugs go upstream (`tulir/whatsmeow/issues`).
- Never commit `store/*.db`, `store/.lock`, `.env`, media, QR payloads.
- Never run two `serve` on same `-store`; default bind loopback only.
- See `AGENTS.md` for full map. Keep this file under 24KB.
