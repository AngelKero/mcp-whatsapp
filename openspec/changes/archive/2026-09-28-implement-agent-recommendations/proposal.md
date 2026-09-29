# Proposal

## Why

Following deep research on agent-ready engineering, five high-leverage architectural improvements were approved: (1) converting declarative OpenSpec scenarios into automated executable contract tests, (2) formalizing Architecture Decision Records (ADRs) to freeze deliberate trade-offs, (3) enhancing MCP tool error feedback with actionable fix instructions, (4) automating knowledge graph maintenance via Makefile, and (5) defining specialized subagent roles. Without this change, AI coding agents lack executable scenario validation, risk dismantling deliberate design decisions, and receive unhelpful generic errors when invoking MCP tools.

## What Changes

- Add capability `agent-harness` specifying automated scenario verification and specialized subagent operational profiles.
- Introduce `test/unit/openspec-scenarios.test.js` to execute contract tests against OpenSpec scenarios across `mac-control`, `passive-extractor`, `chat-search`, `school-notices`, and `proactive-pulse`.
- Create `docs/adr/` with four Architecture Decision Records (`ADR-001` through `ADR-004`).
- Add ergonomic error formatting helpers in `internal/mcp/result.go` (`ToolErrorWithFix`) and apply them to parameter validation in `internal/mcp/tools_send.go`.
- Add `graph-update` and `test-all` targets to `Makefile`.
- Formalize subagent role definitions in `.opencode/agents/` (`architect.md`, `implementer.md`, `qa-reviewer.md`).

## Capabilities

### New Capabilities

- `agent-harness`: Automates verification of OpenSpec behavioral scenarios via synthetic unit tests, defines subagent roles, and governs developer ergonomics.

### Modified Capabilities

(none)

## Impact

- **Affected MCP tools** (of 42): Error response format enhanced on `send_message`, `send_reply`, `send_file`, `send_audio_message`, `send_sticker` to return explicit constraint failure descriptions and fix instructions in `CallToolResult`.
- **Store schema impact**: None. No database migrations.
- **Rollback plan**: Delete change directory before apply; after archive, `git revert` the archive commit. No database restore or re-pairing required.
