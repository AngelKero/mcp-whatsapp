# Spec Delta

## Purpose

Provides local Full-Text Search and Retrieval-Augmented Generation (RAG) over historical WhatsApp messages using SQLite FTS5.

## ADDED Requirements

### Requirement: SQLite FTS5 virtual table and real-time triggers

The search engine SHALL maintain an FTS5 virtual table (`messages_fts`) indexing message content and an automatic SQLite trigger (`messages_ai`) that indexes new non-empty messages as they arrive without batch reindexing delays.

#### Scenario: Real-time message indexing
- **WHEN** a new text message is inserted into `messages`
- **THEN** the `messages_ai` trigger mirrors the message ID, chat JID, sender, content, and timestamp into `messages_fts` immediately.

### Requirement: Query token sanitization

The search engine SHALL sanitize incoming search queries by stripping special punctuation and syntax-sensitive FTS5 operators (`AND`, `OR`, `NOT`, `NEAR`), transforming remaining tokens into prefix wildcards to avoid syntax crashes and allow natural matching.

#### Scenario: Special characters in search query
- **WHEN** the user searches for `examen (redes)?!`
- **THEN** special characters are cleaned and tokens are formatted safely for the FTS5 MATCH clause.

### Requirement: Fast ranked search and highlighted snippet generation

The search engine SHALL execute MATCH queries against `messages_fts`, order results chronologically and by relevance, and generate highlighted snippet excerpts (`snippet(messages_fts, ...)`) showing matches in context within 15 milliseconds.

#### Scenario: Query with multiple matches
- **WHEN** the user executes a search for `comprobante oxxo`
- **THEN** the top matching historical messages are returned formatted with timestamp, originating chat name, sender, and highlighted snippet text.

### Requirement: Chat command invocation and group authorization

The system SHALL intercept `!buscar <término>`, `/buscar <término>`, and natural search requests directed at the bot; in group chats, search execution MUST be restricted to the owner to prevent exposing private message history.

#### Scenario: Search triggered by owner in group
- **WHEN** the owner sends `!buscar calificaciones` in a group
- **THEN** the search executes and results are replied directly into the group.

#### Scenario: Search attempted by third party in group
- **WHEN** a third party sends `!buscar algo` in a group chat
- **THEN** the command is ignored by the search middleware and passes through the pipeline without executing.
