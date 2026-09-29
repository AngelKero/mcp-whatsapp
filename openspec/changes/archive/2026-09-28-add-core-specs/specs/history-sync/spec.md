# Spec Delta

## Purpose

How historical WhatsApp messages enter the local SQLite cache via backfill requests, what anchors and options mean, and when missing history must be accepted as lost.

## ADDED Requirements

### Requirement: Anchor semantics

`request_sync` SHALL anchor on a real cached message: `oldest` extends history backwards `count` messages at a time (repeatable walk), while `newest` (default) only fills gaps below the most recent message. `count` SHALL default to 50 and reject negative values.

#### Scenario: Backward walk

- **WHEN** a chat has a gap older than the cached window
- **THEN** repeated `request_sync` calls with `anchor: "oldest"` extend the cached history backwards in `count`-sized steps.

#### Scenario: Negative count rejected

- **WHEN** `request_sync` is called with a negative `count`
- **THEN** the result is an error stating count must not be negative, before any network call.

### Requirement: LID-aware resolution by default

`request_sync` SHALL resolve the chat to its LID form by default (`use_lid: true`); callers walking back past WhatsApp's LID migration boundary SHALL set `use_lid: false` when LID-anchored batches return empty.

#### Scenario: Pre-migration history

- **WHEN** backfill stalls returning empty batches on an old chat
- **THEN** retrying with `use_lid: false` addresses the phone-number-JID keyed history.

### Requirement: Async arrival and accepted loss

Backfilled messages SHALL arrive asynchronously and become queryable via `list_messages` once delivered; an empty result after a request means the server served nothing for that cursor — typically history predating WhatsApp's retention for linked devices — and SHALL be accepted as lost, not retried forever.

#### Scenario: Predated retention

- **WHEN** `request_sync` returns a confirmation but `list_messages` stays empty for that range
- **THEN** the gap is treated as beyond retention and documented as lost.

### Requirement: Timestamp-anchored requests

`from_timestamp` (ISO-8601 UTC) SHALL anchor on the newest cached message at or before that time, falling back to the oldest cached message when nothing is cached that far back, and SHALL be ignored when `anchor` is set. Malformed timestamps SHALL be rejected with an `invalid from_timestamp` error.

#### Scenario: Malformed timestamp

- **WHEN** `request_sync` is called with `from_timestamp: "not-a-date"`
- **THEN** the result is an `invalid from_timestamp` error before any network call.
