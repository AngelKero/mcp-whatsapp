---
trigger: always_on
description: Security guards for mcp-whatsapp (Antigravity mirror of opencode whatsapp-guards plugin).
---

# Security guards (always on)

Espejo de `.opencode/plugins/whatsapp-guards.js` para Antigravity
(que no ejecuta plugins de opencode).

- Nunca editar directo: `.env*`, `store/*.db`, `store/.lock`,
  `*.qr.png`, `*-wal`, `*-shm`.
- `media_path`/`output_path` siempre bajo `WHATSAPP_MCP_MEDIA_ROOT`.
- En logs/errores: JIDs a últimos dígitos, nunca phones completos.
- Tras editar `.go`: correr `gofmt -w <file>` (equivale al PostToolUse).
- Nunca dos `serve` sobre el mismo `-store`; nunca non-loopback sin
  `-allow-remote` + `WHATSAPP_MCP_TOKEN`.
