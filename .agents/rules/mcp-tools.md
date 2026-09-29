---
trigger: model_decision
description: Apply when adding or editing MCP tools, tool descriptions, or error messages in internal/mcp/.
---

# MCP tool rules

- Tool names: `verb_noun` snake_case, no versions.
- Every param: description with constraints + example. Prefer enums + defaults.
- Description must state when NOT to use the tool (e.g. `send_file` vs `send_audio_message`, `send_typing` vs `send_presence`).
- Errors for agents: include constraint + violation + fix (e.g. allowlist root, `request_sync` hint).
- Read-only context prefers resources over new tools; keep total under control (currently 42 — justify additions).
- Do NOT add `subscribe_presence`, photo setter, communities/newsletters without OpenSpec proposal.
- Reference: `.claude/rules/mcp-tool-descriptions.md`, `openspec/specs/mcp-tools/spec.md`.
