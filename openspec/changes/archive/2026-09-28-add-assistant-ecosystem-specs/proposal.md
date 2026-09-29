# Proposal

## Why

While `openspec/specs/` documents the underlying Go WhatsApp daemon (`whatsapp-daemon`, `mcp-tools`, `media-pipeline`, `history-sync`, `groups-privacy`, `security-allowlist`) and the recently added web dashboard (`dashboard-panel`), the entire intelligent assistant layer running on Node.js, Apple Silicon Metal GPU (Laya-MLX), SQLite, and Notion has zero OpenSpec specifications. Nine live, production-grade capabilities—macOS SysAdmin control, passive Notion extraction, local FTS5 chat search, university lecture recording and synthesis, proactive predictive alerts, school notice detection, multimodal sticker vault and learning, voice synthesis, and adaptive turn-taking—exist without formal behavioral contracts. Any modification to the pipeline or modules risks silent regression of core behavior, user privacy, or database integrity.

## What Changes

- Add nine new capability specifications under `specs/` documenting existing production behavior (docs-only change; zero runtime code changes, zero migrations):
  - `mac-control`: Remote macOS control commands (`!mac status`, `ping`, `lock`, `screen`), battery and metric reporting, and owner-only authorization guard.
  - `passive-extractor`: Natural language extraction to Notion Second Brain (expenses, tasks, reminders, date planning, project/note creation, and task cancellation).
  - `chat-search`: Local SQLite FTS5 Full-Text Search over chat history with BM25 ranking, snippet generation, query sanitization, and `!buscar` dispatching.
  - `class-notes-manager`: Academic lecture recording with Whisper Small MLX, CUCEA 2026B timetable auto-resolution, pedagogical note synthesis into Notion, and task creation.
  - `proactive-pulse`: Autonomous background pulse engine firing predictive deadline warnings (5h and 2h), university departure alerts, and battery level warnings with SQLite idempotency.
  - `school-notices`: Real-time monitoring of official CUCEA WhatsApp course groups, Laya-MLX notice classification, and Notion logging.
  - `sticker-system`: Multimodal sticker vault with SQLite FTS5, live auto-learning via Apple Vision OCR + VLM in active conversations, and autonomous/on-demand sticker dispatcher.
  - `voice-synthesizer`: Natural Text-to-Speech voice notes using macOS native Paulina voice, humanizer phonetic pre-processing, and ffmpeg Opus PTT encoding.
  - `ai-turn-taking`: Adaptive conversation state machine (`IDLE` -> `ACTIVE` 90s -> `LURK_MODE` 15m), Laya-MLX ambient chime-in evaluation, dynamic model routing (`pickModel`), and trivial message fast path.
- No existing spec requirements change; no tool signatures change.

## Capabilities

### New Capabilities

- `mac-control`: Remote SysAdmin control of macOS via WhatsApp (`!mac`), system health metrics, ping alert, screen capture, and strict owner authorization.
- `passive-extractor`: Passive natural language extraction into Notion databases (expenses, tasks with Actionability Gate, natural language reminders, date planning, and rollback).
- `chat-search`: Local SQLite FTS5 search engine over historical chat messages with BM25 ranking and highlighted snippets via `!buscar` or `/buscar`.
- `class-notes-manager`: University lecture recording, Whisper MLX transcription, CUCEA 2026B timetable resolution, and pedagogical note synthesis into Notion.
- `proactive-pulse`: Autonomous background heartbeat engine delivering predictive deadline alerts (5h/2h), class outing notifications, and critical battery warnings.
- `school-notices`: CUCEA WhatsApp official group monitor with Laya-MLX notice classification (`no_hay_clase`, `clase_virtual`, `cambio_aula`) and Notion logging.
- `sticker-system`: Multimodal sticker comprehension, SQLite FTS5 Sticker Vault, inbound sticker auto-learning via Vision OCR + VLM, and contextual sticker responder.
- `voice-synthesizer`: Local Text-to-Speech engine utilizing macOS native Mexican Spanish voice (Paulina) with phonetic humanization and Opus PTT encoding.
- `ai-turn-taking`: Multi-turn state machine (`IDLE`, `ACTIVE`, `LURK_MODE`), ambient buffer listening, Laya-MLX chime-in classifier, dynamic model selection, and zero-cost acknowledgments.

### Modified Capabilities

(none)

## Impact

- **Affected MCP tools** (of 42): None directly modified. The assistant ecosystem consumes `send_message`, `send_reply`, `send_file`, `send_audio_message`, `send_sticker`, `download_media`, `send_typing`, and `send_reaction` via `mcp-client.js`.
- **Store schema impact**: None. Documents existing schemas in `store/messages.db` (FTS5 `messages_fts`), `store/sessions.db` (`ai_sessions`, `ambient_buffer`), `store/reminders.db` (`dispatched_pulses`), and `store/stickers/vault.db` (`stickers`, `stickers_fts`).
- **Rollback plan**: Delete `openspec/changes/add-assistant-ecosystem-specs/` before apply; after archive, `git revert` the archive commit. No runtime behavior changes, no migrations, no re-pair required.
