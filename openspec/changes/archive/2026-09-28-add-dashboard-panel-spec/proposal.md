# Proposal

## Why

The chat autonomy dashboard (`!panel` → `http://localhost:8767`) is a live, user-facing surface — killswitch, per-chat autonomy modes, session resets — with zero spec coverage. Contributors editing `modules/dashboard/` or `modules/permissions/` have no behavior contract, so guarantees like "panel command always answers Ángel" or "marketplace chats default to SILENT" can regress silently.

## What Changes

- Add one new capability spec `dashboard-panel` documenting **existing** behavior (no code changes, no migrations): serving, autonomy modes + smart defaults, `!panel` invocation rules, REST API, session reset, and fail-open DB semantics.
- No existing spec requirements change; no tool signatures change.

## Capabilities

### New Capabilities

- `dashboard-panel`: the local web control panel and per-chat autonomy/permission system of the Node watcher layer.

### Modified Capabilities

(none)

## Impact

- **Affected MCP tools** (of 42): none directly — the panel lives in the Node watcher layer (`whatsapp-watcher.js`, `modules/dashboard/server.js`, `modules/permissions/chat-permissions.js`, `pipeline/middlewares/chat-permissions.middleware.js`), not the Go MCP daemon. It reads `store/messages.db` (read-only) and `store/chat-permissions.db`, plus `store/sessions.db` for the active-session count.
- **Store schema impact**: none. Docs-only change; `chat-permissions.db` schema (`chat_permissions`, `bot_global_config`) is described, not altered.
- **Rollback plan**: delete `openspec/changes/add-dashboard-panel-spec/` before apply; after archive, `git revert` the archive commit. No runtime behavior changes.
