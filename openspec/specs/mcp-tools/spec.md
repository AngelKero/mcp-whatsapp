# mcp-tools Spec

## Purpose
42 MCP tools over Streamable HTTP at `/mcp` for reading, sending, and administering a personal WhatsApp account.

## Requirements

### Requirement: Read path ordering
Query tools SHALL follow `list_chats` → `list_messages` → `request_sync` (backfill) → `download_media` with `output_path` under `WHATSAPP_MCP_MEDIA_ROOT` for sandboxed clients.

#### Scenario: Sandboxed download
- **WHEN** a sandboxed client calls `download_media` without `output_path`
- **THEN** file lands only in daemon cache and client is told to retry with `output_path` under shared root.

### Requirement: LID resolution
Store queries SHALL normalise `@lid` JIDs via `whatsmeow_lid_map` so contact matching uses real phone numbers.

#### Scenario: LID message
- **WHEN** a message arrives from `@lid`
- **THEN** `list_messages`/`search_contacts` resolve it to the mapped phone.

### Requirement: Poll integrity
`send_poll` SHALL use `wa.BuildPollCreation` attaching `MessageSecret` so votes decrypt; tallies include zero-vote options.

#### Scenario: Vote without secret
- **WHEN** poll lacks MessageSecret
- **THEN** votes fail to decrypt (regression barred by this spec).

### Requirement: Tool description quality
Each tool description SHALL state purpose narrowly, when-NOT-to-use, and errors SHALL include constraint + fix.

#### Scenario: Path outside allowlist
- **WHEN** `media_path` escapes `WHATSAPP_MCP_MEDIA_ROOT` (symlinks resolved)
- **THEN** error names the root and suggests moving the file or setting the env var.

### Requirement: Deferred surface
The server SHALL NOT expose `subscribe_presence`, profile-photo setter, or communities/newsletters without an approved proposal.

#### Scenario: New tool request
- **WHEN** a contributor proposes `subscribe_presence`
- **THEN** an OpenSpec change is required before implementation.
