# Design

## Context

See proposal.md (Why) for motivation. Current state: `openspec/specs/` holds `mcp-tools` and `whatsapp-daemon` only; the four new capabilities describe behavior already implemented in `internal/media`, `internal/client/history.go`, `internal/client/features_groups.go`, `internal/mcp/tools_groups.go`, `internal/mcp/tools_privacy.go`, and `internal/security`. This change is docs-only: no code, schema, or tool-signature edits.

## Goals / Non-Goals

**Goals:**

- Give each undocumented behavior area a spec-level home with testable Scenarios.
- Pin whatsmeow traceability per project rule (method names live here, not in specs).

**Non-Goals:**

- No behavior changes, refactors, or new tools (the Deferred-surface requirement in `mcp-tools` still governs additions).
- No `.agents/rules/` or skill edits; those mirror specs but are maintained separately.

## Decisions

- **Four new flat capabilities over amending `mcp-tools`.** The project uses a flat `specs/<cap>` layout; media, sync, groups, and security are distinct domains with distinct reviewers. Alternative (folding everything into `mcp-tools`) was rejected: that file would triple in size and lose per-domain ownership.
- **Specs assert observable behavior only; whatsmeow methods live here.** Per spec instructions, implementation names stay out of specs. Traceability mapping:
  - media-pipeline → `wa.Download` (fetch), ffmpeg shell-out (non-ogg only), `WHATSAPP_MCP_MEDIA_ROOT` containment in `internal/security/paths.go`.
  - history-sync → `wa.BuildHistorySyncRequest` via `client.RequestHistorySync`; `oldest`/`newest` anchors and `use_lid` flag in `registerRequestSync`.
  - groups-privacy → `wa.CreateGroup`, `wa.LeaveGroup`, `wa.JoinGroupWithLink`, `wa.SetGroupAnnounce`, `wa.SetGroupLocked`, `wa.SetGroupName`, `wa.GetGroupInfo`, `wa.GetGroupInviteLink`, `wa.GetBlocklist`, `wa.GetPrivacySettings`.
  - security-allowlist → `internal/security/paths.go` (symlink-resolving containment), `internal/security/redactor.go` (last-digits), daemon bind guard, `/pair` rate limiter.
- **Empty-store e2e as spec evidence.** The new `e2e/{poll,sync,lid}_e2e_test.go` harnesses already lock validation strings (`at least 2`, `max 32`, `chat_jid: required`, `not found in cache`) and LID normalization at the MCP surface; Scenarios reference those exact behaviors.

## Risks / Trade-offs

- [Risk] Spec drift: code changes without spec updates → Mitigation: `tasks.md` includes a parity gate (`make test`, `make e2e`, `openspec validate --strict`) on every future change touching these areas; review checklist in `review.md` agent already covers spec truth.
- [Risk] Over-specifying: pinning messages like `at least 2` makes copy edits spec-breaking → Mitigation: accepted; exact error strings are client contracts (sandboxed clients match on them), so the friction is intentional.
- [Risk] Duplication with `mcp-tools` LID/poll requirements → Mitigation: `mcp-tools` keeps the one-line invariants; the new caps own the full semantics. No requirement text is modified, so no delta conflicts.

## Migration Plan

No deployment or data migration. Rollback: delete `openspec/changes/add-core-specs/` before apply; after archive, `git revert` the archive commit. No re-pair or DB restore needed.

## Open Questions

None — docs-only change grounded in implemented, e2e-locked behavior.
