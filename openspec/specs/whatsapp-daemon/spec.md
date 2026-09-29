# whatsapp-daemon Spec

## Purpose
Long-running Go daemon that holds the WhatsApp multidevice session, caches events to SQLite, and serves MCP over HTTP.

## Requirements

### Requirement: Single-instance serve
The daemon SHALL enforce single-instance per store directory via flock on `store/.lock` and refuse a second `serve`/`login` with a clear error.

#### Scenario: Second serve blocked
- **WHEN** a second `serve` starts on the same `-store`
- **THEN** it exits with `another whatsapp-mcp instance is already running`.

### Requirement: Pairing flows
The system SHALL support `login` (terminal QR) and `serve` + `/pair` (browser QR) writing session to `store/whatsapp.db`, with re-pair roughly every 20 days via fresh QR.

#### Scenario: Re-pair after rotation
- **WHEN** WhatsApp invalidates the session
- **THEN** `/pair` serves a fresh QR without restart.

### Requirement: Event persistence window
Events SHALL persist to `store/messages.db` only while `serve` runs; on restart HistorySync backfills within WhatsApp retention, and `request_sync` covers short known gaps per chat.

#### Scenario: Offline gap
- **WHEN** daemon restarts after short downtime
- **THEN** recent messages backfill, older-than-retention gaps require `request_sync` or are accepted as lost.

### Requirement: Safe bind
`serve` SHALL default to loopback `127.0.0.1:8765`; non-loopback requires `-allow-remote` + `WHATSAPP_MCP_TOKEN`, else exit.

#### Scenario: Remote without token
- **WHEN** `-addr 0.0.0.0:8765` without token
- **THEN** serve exits with missing-token error.
