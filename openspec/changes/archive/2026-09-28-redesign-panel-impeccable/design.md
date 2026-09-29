# Design

## Context

See proposal.md (Why). Current state: the panel is one inline `SPA_HTML` string in `modules/dashboard/server.js` (361 lines total file) served by native `http` with five JSON endpoints; behavior is frozen by `dashboard-panel` spec (6 requirements, 7 scenarios). The Impeccable skill (v4.3.1, installed globally + project) provides `/shape`, `/polish`, `/audit`, and a local detector CLI. This change touches only the SPA string and its inline CSS/JS — no routes, no API shapes, no DB code.

## Goals / Non-Goals

**Goals:**

- Mobile-first visual/UX overhaul executed through Impeccable's own workflow so direction, tokens, and polish come from the skill, not ad-hoc taste.
- Detector-clean handoff (zero P0) with every existing control preserved and wired.

**Non-Goals:**

- No endpoint, schema, or autonomy-semantics changes; no new npm dependencies; no build step (the file must stay `node`-runnable as-is).
- No `/impeccable init` product-wide rollout — scope is the panel SPA only (`PRODUCT.md`/`DESIGN.md` artifacts land only if the skill creates them for this surface).

## Decisions

- **Impeccable-led flow: `/impeccable shape` → build → `/polish` → `/audit`.** The skill's discovery interview resolves aesthetic direction with the user at apply time instead of this doc guessing it. Alternative (hand-written mockups in proposal) rejected: duplicates what the skill is installed to do.
- **Keep the single-file inline SPA.** Constraint: zero-dep native HTTP server with no static-file handling or build step. Splitting CSS/JS into files would require new routes and cache behavior — out of scope. Alternative (extract to `modules/dashboard/public/`) deferred to a future change if the SPA outgrows inline maintenance.
- **API freeze as the safety rail.** All six existing `dashboard-panel` behavior requirements stay green; the new visual requirements are additive. Any Impeccable suggestion that alters endpoint shapes or autonomy semantics is rejected during apply.
- **Render budget preserved.** The list already caps at 300 rendered rows with 60s refresh; the redesign MUST NOT regress this (no per-row heavy effects, no synchronous layout thrash on 1523-chat payloads).

## Risks / Trade-offs

- [Risk] `/shape` discovery is interactive and may stall on taste questions → Mitigation: tasks timebox discovery; spec constraints (chosen direction, Spanish, control parity) are non-negotiable defaults so the build can proceed.
- [Risk] Detector P0s on patterns intrinsic to inline SPA (e.g. `<style>` in JS string) → Mitigation: record as accepted in tasks with reason; gate is zero *unaccepted* P0s.
- [Risk] 300-row render perf with richer cards → Mitigation: keep row DOM flat, verify with the 1523-chat production payload during apply.
- [Risk] Touch-target growth breaks the 360px no-scroll rule → Mitigation: mobile viewport check is a handoff gate, not an afterthought.

## Migration Plan

No migration. Rollback: revert the single apply commit. Before/after evidence: screenshot pair (desktop 1440px + phone 360px) plus `curl` snapshots of `/api/status` and `/api/chats` proving payload parity.

## Open Questions

Resolved before apply: aesthetic direction = Vibrante lúdico (chosen by the owner); `/shape` only derives tokens and components within that direction. No other open questions.
