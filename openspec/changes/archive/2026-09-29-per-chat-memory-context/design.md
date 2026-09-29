# Design

## Context

See proposal.md (Why) and `specs/chat-memory/spec.md` for requirements. Current state observed in repo:

- Pipeline: `whatsapp-watcher.js` chains `anti-echo → chat-permissions → media-extractor → chat-search → gatekeeper → mac-control → passive-extractor → school-notice` (`pipeline/middlewares/`). No memory middleware exists.
- Store: `store/messages.db` has `chats`, `messages`, `poll_votes`, `messages_fts` (FTS5) + `messages_ai` trigger. No memory tables.
- Panel: `modules/dashboard/server.js` serves SPA on 8767 with `GET /api/chats`, `PUT /api/chats/:jid`, `POST /api/chats/:jid/reset`, `POST /api/status/toggle`. No memory endpoints.
- Extraction precedent: `passive-extractor.middleware.js` + `system-one-client.js` (Laya-MLX <30ms gate) + `pickModel`/`agy` for heavy calls; `chat-search.middleware.js` owns the FTS5 sanitization + owner-gate pattern to reuse.
- whatsmeow traceability: this change adds **zero new whatsmeow calls**. Bootstrap reads the local SQLite already populated by the existing history-sync path (`request_sync` → whatsmeow message-history fetch). Group-vs-DM disambiguation reuses the existing `GetGroupInfo` result where available; no `BuildPollCreation` involvement.

## Goals / Non-Goals

**Goals:** per-JID durable facts with session survival; pre-turn injection under budget; post-turn extraction (0–3 facts); panel toggle + bootstrap + facts CRUD; chat commands with owner-gate in groups; idempotent bootstrap; fail-open on any memory failure.

**Non-Goals:** vector DB (Qdrant/Chroma/pgvector) in v1; cross-chat federated recall; new MCP tools on the Go daemon (all 42 unchanged); changes to `messages/chats/messages_fts` schema or triggers; automatic Notion sync of memory facts (stays local unless a later change proposes it).

## Decisions

1. **Storage: three tables in `store/messages.db` (`memory_facts`, `memory_settings`, `memory_events`), `IF NOT EXISTS`.**
   Rationale: single-writer (watcher, `{readOnly:false}` only in memory module; everything else keeps `{readOnly:true}`), no new DB file to lock/back up, FTS5 `messages_fts` stays the verbatim-search layer while `memory_facts` is the distilled layer. Alternative (separate `memory.db`): rejected — doubles backup/lock surface for no isolation gain since access is already per-JID namespaced.

2. **Retrieval: FTS5-assisted + recency rank, no embeddings in v1.**
   Rationale: `chat-search` already sanitizes FTS5 operators and returns in <15ms; facts are short (`key: value`) so keyword+recency outranks semantic at this scale (dozens of facts per chat, not thousands). Alternative (embeddings via local model): deferred to v2 behind the same `search` function seam; schema already carries `updated_at`/category for re-rank.

3. **Scope key: normalized JID (LID-resolved phone for DMs; `group_jid:sender_jid` for groups), `scope=self|group|global`.**
   Rationale: matches `whatsmeow_lid_map` normalization used by `list_messages`/`search_contacts` and the `per-channel-peer` isolation precedent; prevents context bleeding. Alternative (raw JID string): rejected — same person on `@lid` vs `@s.whatsapp.net` would fork memory.

4. **Middleware position: inject early (right after `chat-permissions`, before `gatekeeper`), extract late (after reply send, fire-and-forget).**
   Rationale: injection must precede any LLM/model call including `mac-control`/`passive-extractor` decisions; extraction must never block the reply (circuit-breaker: timeout 3s, on failure skip silently + log). Alternative (single middleware doing both): rejected — couples read path latency to extraction LLM cost.

5. **Extraction two-tier: System One (Laya-MLX) actionability gate → `agy` cheap model for fact shaping.**
   Rationale: reuses the existing fast-path/trivial + `pickModel` pattern; 95% of banter dies at the local gate with $0 cost. `!recordar` bypasses the gate (explicit user intent). Alternative (always-LLM): rejected — cost/latency on every message.

6. **Bootstrap: `POST /api/chats/:jid/memory/bootstrap {limit≤50}` reading `messages` ordered by timestamp, long-range prompt, `source_msg_id` dedupe.**
   Rationale: mirrors the documented replay-history pattern (original timestamps preserved, stable ids for idempotency); runs async with progress row in `memory_events`. Alternative (live re-fetch via `request_sync` inside bootstrap): rejected — bootstrap must not trigger network sync; operator runs `request_sync` first if history is thin.

7. **Forget semantics: soft-delete + confirmation.**
   Rationale: fuzzy match is lossy; RedDB/Pi-agent precedent (show match → explicit `sí` → flip `deleted_at`, partial-index-style exclusion via `WHERE deleted_at IS NULL`). `!olvidar todo`/Clear requires double confirmation.

## Risks / Trade-offs

- [Stale facts contradict new messages] → Precedence rule: latest user message > session facts > global facts; Dream cron flags same-key conflicts, keeps newest, marks `conflicted`.
- [Token bloat as facts grow] → Hard budget (profile ~300 tokens + ≤8 facts); overflow drops by relevance+recency; panel surfaces count so owner prunes.
- [Extraction writes junk] → Gate + 0–3 cap + category allowlist + `memory_events` audit; panel edit/delete is one tap.
- [SQLite WAL lock contention] → Memory writes go through a single serialized queue; readers use existing readOnly handles; on lock, fail open to no-memory turn.
- [Privacy: facts are PII] → Local-only, per-JID isolation, no Notion upload in v1; Clear-all is one action; Temporary-style chats = memory-disabled chats.
- [LID/phone fork] → Normalize at write AND read via `whatsmeow_lid_map`; migration backfills existing rows once.

## Migration Plan

1. Deploy: create tables `IF NOT EXISTS` on watcher boot; default every JID to memory `enabled=false` (opt-in, zero behavior change on upgrade).
2. Owner enables per chat (panel toggle or `!recordar` auto-enables that chat with confirmation).
3. Optional: tap `Generar contexto` per chat (idempotent; safe to re-run).
4. Rollback: toggle OFF per chat or killswitch global → turns behave as today; `DELETE ...?all=1` purges facts; restore `store/messages.db` from backup if schema work misbehaves; daemon untouched (no re-pair needed; `/pair`/`login` only if daemon itself breaks).
5. Forward path (v2, not this change): embeddings column + vector index, cross-chat `global` recall, Dream auto-consolidation cron — each as its own proposal.

## Open Questions

- Default TTL for facts (90d prune vs indefinite)? Deferrable: ship indefinite + manual clear; cron prune lands in v2 without spec change (retention policy is an operational default, scenarios already cover prune-via-clear).
- Exact token budget numbers per chat tier? Deferrable: constants in one config object, tunable without behavior change.
