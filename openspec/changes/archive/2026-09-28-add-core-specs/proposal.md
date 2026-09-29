# Proposal

## Why

`openspec/specs/` covers only `mcp-tools` (5 requirements) and `whatsapp-daemon` (4 requirements). Four load-bearing behaviors — media transcoding/allowlist, history backfill semantics, group/blocklist/privacy admin, and the security allowlist + JID redaction — exist only as tribal knowledge in `AGENTS.md` and code. Any contributor touching those areas has no spec-level truth to check against, so regressions (e.g. votes failing without `MessageSecret`, LID mismatches like #41) get re-discovered instead of barred.

## What Changes

- Add four new capability specs documenting **existing** behavior (no code changes, no migrations):
  - `media-pipeline`: ogg analysis, ffmpeg shell-out only for non-ogg, `output_path`/`media_path` under `WHATSAPP_MCP_MEDIA_ROOT`, view-once, WebP stickers.
  - `history-sync`: `oldest`/`newest` anchors, `use_lid` default true, WhatsApp retention limits, accepted-loss semantics.
  - `groups-privacy`: group admin (announce/locked, name/topic, invites, participants), blocklist, privacy knobs.
  - `security-allowlist`: path allowlist with symlink resolution, JID redaction to last digits, loopback-by-default bind, `/pair` rate-limit.
- No existing spec requirements change; no tool signatures change.

## Capabilities

### New Capabilities

- `media-pipeline`: how audio/image/video/document/sticker bytes flow between WhatsApp, ffmpeg, and the media root.
- `history-sync`: how `request_sync` backfills gaps, anchor semantics, and what "lost history" means.
- `groups-privacy`: group administration, blocklist, and privacy settings surface.
- `security-allowlist`: filesystem allowlist, log redaction, and safe-bind guarantees.

### Modified Capabilities

(none — existing `mcp-tools` and `whatsapp-daemon` requirements are unchanged)

## Impact

- **Affected MCP tools** (of 42): `send_file`, `send_audio_message`, `send_sticker`, `download_media` (media-pipeline); `request_sync`, `list_messages`, `get_message_context` (history-sync); group tools (`create_group`, `update_group_participants`, `set_group_name`, `set_group_topic`, `set_group_announce`, `set_group_locked`, `get_group_info`, `get_group_invite_link`, `join_group_with_link`, `leave_group`), blocklist tools, privacy tools (groups-privacy); cross-cutting path args on all file-accepting tools (security-allowlist).
- **Store schema impact**: none. Docs-only change; no migration, no code edits.
- **Rollback plan**: delete `openspec/changes/add-core-specs/` before apply; after archive, revert via `git revert` of the archive commit. No re-pair or DB restore needed (no runtime behavior changes).
