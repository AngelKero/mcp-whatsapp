# Spec Delta

## Purpose

Enables multimodal sticker comprehension, local SQLite FTS5 cataloging, live auto-learning from incoming chats, and contextual autonomous responses.

## ADDED Requirements

### Requirement: SQLite FTS5 Sticker Vault

The system SHALL store indexed stickers in an SQLite database (`vault.db`) with an FTS5 virtual table indexing meme names, visual descriptions, emotions, communicative intents, OCR extracted text, and semantic tags, supporting ranked BM25 retrieval.

#### Scenario: Semantic search in sticker vault
- **WHEN** a sticker query is formulated for `exito motivacion`
- **THEN** the vault retrieves ranked candidates matching tags, description, or emotion.

### Requirement: Inbound sticker auto-learning in active sessions

When an incoming sticker is received within an active conversation thread and its SHA-256 hash is not in the vault, the system SHALL extract visual text via Apple Vision OCR, determine visual semantics and emotional tone via multimodal vision analysis, copy the WebP file into permanent vault storage, and record its profile.

#### Scenario: New sticker sent by participant
- **WHEN** a user sends an unknown sticker during an active session
- **THEN** the system downloads the file, analyzes its visual content and text, and registers the new sticker in the vault.

### Requirement: Inbound sticker context injection

When a known or newly learned sticker arrives in an active session, the system SHALL synthesize a semantic context block (including meme name, emotion, intent, and visible text) and inject it into the message context for the language model to perceive.

#### Scenario: Sticker perceived by conversation model
- **WHEN** a participant sends a laughter meme sticker
- **THEN** a structured snippet `[Sticker enviado por Usuario: Meme | Emoción: risa]` is prepended to the turn text.

### Requirement: Anti-echo sticker deduplication

The system MUST record the SHA-256 hash and message ID of all bot-dispatched stickers and discard any echo events originating from the bot's own transmissions to prevent infinite auto-reply loops.

#### Scenario: Echo of sent sticker
- **WHEN** a sticker event is emitted matching an ID or hash previously dispatched by the bot
- **THEN** the event is dropped immediately without triggering pipeline execution.

### Requirement: Autonomous and on-demand sticker response

The system SHALL support explicit sticker requests (e.g., `mándame un sticker`, `pasa un sticker de risa`) and autonomous contextual sticker replies in playful conversation turns; autonomous dispatch MUST adhere to a cooldown of at least 4 conversation turns and 60 seconds per chat.

#### Scenario: Explicit sticker request
- **WHEN** the user writes `mándame un sticker de éxito`
- **THEN** the system bypasses cooldowns, queries the vault for `éxito`, and delivers a matching sticker via `send_sticker`.

#### Scenario: Cooldown active during playful turn
- **WHEN** a turn contains playful text (`xd`, `:3`) but less than 4 turns or 60 seconds have passed since the last sticker
- **THEN** the autonomous sticker dispatch is suppressed.
