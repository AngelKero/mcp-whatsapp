# Proposal

## Why

The control panel (`!panel` → `:8767`) works but looks and feels hand-rolled: flat cards, raw `<select>` controls, no visual hierarchy, no accessibility baseline, and several Impeccable detector tells (weak hierarchy, low-contrast meta text, small touch targets). It is also the most phone-used surface in the stack (opened from WhatsApp on mobile), yet it was designed desktop-first. A full Impeccable-driven redesign fixes hierarchy, touch ergonomics, and craft while keeping every control and API contract intact.

## What Changes

- Full visual/UX redesign of the panel SPA (`SPA_HTML` in `modules/dashboard/server.js`) executed through the Impeccable skill (`/impeccable shape` → build → `/impeccable polish` + `/impeccable audit`), mobile-first.
- New visual/UX requirements pinned on the existing `dashboard-panel` capability (MODIFIED, additive only): control parity, mobile ergonomics, Spanish copy, accessibility floor.
- No API changes (`/api/status`, `/api/chats`, toggle, PUT, reset keep exact shapes), no autonomy-semantics changes, no new dependencies (single-file inline SPA preserved).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dashboard-panel`: ADD visual/UX requirements (control parity, mobile-first ergonomics, Spanish, accessibility floor, Impeccable detector clean). All existing behavior requirements and Scenarios stay unchanged.

## Impact

- **Affected MCP tools** (of 42): none — the panel lives in the Node watcher layer and exposes no MCP tools. REST API shapes consumed by the SPA are frozen by this change.
- **Store schema impact**: none. No database changes.
- **Rollback plan**: single-commit revert restores the previous inline SPA (no migration, no re-pair, no DB restore needed). Keep a screenshot + `curl` snapshot of `/api/status` and `/api/chats` before/after for visual diffing.
