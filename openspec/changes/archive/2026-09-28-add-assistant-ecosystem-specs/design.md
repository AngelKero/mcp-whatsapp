# Design

## Context

See `proposal.md` (Why). The repository is a dual-runtime architecture: a Go binary daemon (`cmd/whatsapp-mcp/`) exposing 42 MCP tools via `mark3labs/mcp-go` and wrapping `whatsmeow` over WebSockets, and a Node.js 24 asynchronous pipeline layer (`whatsapp-watcher.js`, `pipeline/`) that consumes local SQLite databases (`messages.db`, `sessions.db`, `reminders.db`, `vault.db`), Apple Silicon Metal GPU acceleration (`localhost:8766` Laya-MLX), and the Notion API via token-bucket queues. This design establishes the formal contracts connecting pipeline middlewares, repositories, local classifiers, and outbound whatsmeow communication.

## Goals / Non-Goals

**Goals:**

- Formulate complete architectural truth for the nine Node.js/Mac assistant capabilities without altering existing working code.
- Trace how inbound message rows from `messages.db` flow through middleware stages to outbound MCP tools (`send_message`, `send_reply`, `send_file`, `send_audio_message`, `send_sticker`, `send_typing`, `send_reaction`).
- Document Laya-MLX classification schemas and SQLite FTS5 schemas for offline consistency.

**Non-Goals:**

- No Go daemon tool renames or schema migrations.
- No new external cloud API dependencies (Notion and local MLX remain the sole backends).

## Decisions

### 1. Composable Pipeline Architecture (`MessagePipeline`)
- **Decision**: Incoming messages are evaluated sequentially by ordered middlewares (`AntiEcho` $\to$ `ChatPermissions` $\to$ `MediaExtractor` $\to$ `ChatSearch` $\to$ `MacControl` $\to$ `Gatekeeper` $\to$ `PassiveExtractor` $\to$ `SchoolNotice`).
- **Rationale**: Any middleware can terminal-handle a turn (e.g., `!mac` or `!buscar`) in <50ms without invoking downstream language models.
- **Alternatives considered**: Monolithic if-else switch inside `whatsapp-watcher.js` (rejected: proved unmaintainable and regression-prone).

### 2. Dual-Engine Cognition (System 1 + System 2)
- **Decision**: System 1 is local Laya-MLX (322M) running on Metal GPU via `http://127.0.0.1:8766/v1/systemone` answering typed choice/confidence queries in 15–30ms at $0 cost. System 2 is the Antigravity CLI (`agy`) invoked dynamically with complexity-based model selection (`pickModel`).
- **Rationale**: Trivial acknowledgments, notice classifications, actionability checks, and subject resolutions run locally without latency or network costs.
- **Alternatives considered**: Direct LLM invocation for all turns (rejected: caused rate-limiting, slow replies, and unwanted verbosity on simple acknowledgments).

### 3. Native Whatsmeow Communication Tracing
- **Decision**: Outbound actions map strictly to whatsmeow primitives via `mcp-client.js`:
  - Text messages: `send_message` / `send_reply` $\to$ whatsmeow `SendMessage` with optional `ContextInfo.StanzaId` and `ContextInfo.Participant`.
  - Media & Files: `send_file` $\to$ whatsmeow `Upload` + `DocumentMessage` / `ImageMessage`.
  - Voice Notes: `send_audio_message` $\to$ whatsmeow `Upload` + `AudioMessage` (`PTT: true`).
  - Stickers: `send_sticker` $\to$ whatsmeow `Upload` + `StickerMessage`.
  - Typing indicator: `send_typing` $\to$ whatsmeow `SendChatPresence(ChatPresenceComposing)`.
  - Media ingestion: `download_media` $\to$ whatsmeow `DownloadAny`.

### 4. SQLite Storage and Indexing Strategy
- **Decision**: Separate SQLite databases in WAL mode for distinct domain concerns:
  - `store/messages.db`: Cached chats and inbound messages with FTS5 virtual table `messages_fts` and `messages_ai` trigger.
  - `store/sessions.db`: Multi-turn state machine (`ai_sessions`) and ambient eavesdropping buffer (`ambient_buffer`).
  - `store/reminders.db`: Heartbeat deduplication (`dispatched_pulses`).
  - `store/stickers/vault.db`: Multimodal sticker vault with FTS5 virtual table (`stickers_fts`).
- **Rationale**: Isolates write locks and WAL checkpoints, avoiding contention during heavy burst downloads or background scans.

## Risks / Trade-offs

- [Risk] Database lock contention between Go daemon writes and Node.js watcher queries → Mitigation: Node.js connects with `{ readOnly: true }` on `messages.db` and uses short-lived statements with busy-retry guards.
- [Risk] Whisper MLX lecture recording process crashing or lingering in background → Mitigation: `class-notes-manager.js` polls JSON status (`json-status`) and terminates recording via explicit process signaling (`stop`).
- [Risk] False positive task extraction from casual partner chatting → Mitigation: Messages from partner produce private proposals to the owner instead of committing directly to Notion.

## Migration Plan

No code migration required. Existing database schemas and source modules match these design specifications. Rollback is a simple git revert of the spec proposal.
