# security-allowlist Specification

## Purpose
The cross-cutting safety guarantees that protect secrets, personal data, and the host: filesystem allowlist enforcement, log redaction, loopback-by-default networking, and pairing-endpoint rate limiting.

## Requirements

### Requirement: Filesystem allowlist

Every tool accepting `media_path` or `output_path` SHALL resolve symlinks before checking containment under `WHATSAPP_MCP_MEDIA_ROOT`, and SHALL reject escapes with an error naming the allowed root plus the fix (move the file or set the env var).

#### Scenario: Sandbox escape attempt

- **WHEN** any file-accepting tool receives a path outside the media root
- **THEN** no file is read or written and the error names the allowed root.

### Requirement: JID redaction in logs

Debug and operational logs SHALL redact JIDs and phone numbers to their last digits; full phone numbers SHALL never appear in logs, commits, or tool error text. Redaction is obfuscation for log hygiene, NOT anonymisation.

#### Scenario: Debug log with JID

- **WHEN** `WHATSAPP_MCP_DEBUG=1` logs a message send
- **THEN** the JID appears truncated to its last digits.

### Requirement: Loopback by default

`serve` SHALL bind loopback (`127.0.0.1:8765`) unless `-allow-remote` is combined with `WHATSAPP_MCP_TOKEN`; non-loopback without a token SHALL exit instead of serving.

#### Scenario: Remote without token

- **WHEN** serve is started on a non-loopback address without a token
- **THEN** it exits with a missing-token error and serves nothing.

### Requirement: Pairing endpoint rate-limit

`/pair` SHALL be rate-limited so QR polling cannot starve the daemon event loop; limit breaches SHALL return HTTP 429 with a retry signal instead of hanging.

#### Scenario: Polling burst

- **WHEN** clients poll `/pair` in a tight loop
- **THEN** excess requests receive 429 and the daemon stays responsive.
