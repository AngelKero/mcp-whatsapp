# Spec Delta

## Purpose

The local web control panel and per-chat autonomy system through which the owner governs what the bot may do in every chat: global killswitch, three autonomy modes with smart defaults, and one-tap session resets.

## ADDED Requirements

### Requirement: Panel serving

The watcher SHALL serve the panel SPA at `GET /` on port 8767 (override via `DASHBOARD_PORT`), bound to all interfaces so phones on the same Wi-Fi reach it; if the port is taken, the watcher SHALL keep running and log that the panel did not start.

#### Scenario: Port conflict

- **WHEN** port 8767 is already occupied at watcher boot
- **THEN** the watcher continues normally and logs that the panel was skipped.

### Requirement: Autonomy modes and smart defaults

Every chat SHALL resolve to exactly one of `SILENT` (bot ignores the chat entirely), `MENTIONS_ONLY` (explicit invocation only: `!ia`, `!buscar`, `@antigravity`), or `AUTONOMOUS` (ambient listening + turn-taking). Chats with no stored row SHALL default by rule: marketplace/sales chats → `SILENT`, the owner's own chat → `AUTONOMOUS`, everything else → `MENTIONS_ONLY`. Stored rows with an unrecognized mode SHALL read back as `MENTIONS_ONLY`.

#### Scenario: New marketplace chat

- **WHEN** a sales/bazaar group messages for the first time
- **THEN** the bot stays silent without any manual configuration.

#### Scenario: Corrupt mode value

- **WHEN** a stored row holds an unknown `autonomy_mode`
- **THEN** reads report `MENTIONS_ONLY` instead of failing.

### Requirement: Owner-only panel command

`!panel` (plus `/panel`, `!admin`, `/admin`, `panel`, `quiero administrar`, `panel de control`, link-request phrasings) SHALL reply with the panel message (localhost + LAN URLs) when sent by the owner, EVEN IF the chat is `SILENT` or the global killswitch is off. The same text from any other sender SHALL be ignored by this rule.

#### Scenario: Silenced chat still serves owner

- **WHEN** the owner sends `!panel` in a `SILENT` chat
- **THEN** the panel link is delivered and the turn is consumed (no further pipeline processing).

### Requirement: Global killswitch

The killswitch SHALL default to ON (bot active); turning it OFF SHALL silently drop every pipeline turn except the owner's panel command. DB failures SHALL fail open (bot stays active).

#### Scenario: Killswitch off

- **WHEN** the killswitch is off and a non-owner message arrives
- **THEN** nothing is processed and nothing is replied.

### Requirement: Per-chat REST administration

The panel SHALL expose `GET /api/status` (killswitch, uptime, classifier health, chat/session counts), `POST /api/status/toggle`, `GET /api/chats` (up to 2000 chats by recency, excluding status broadcasts and newsletters), `PUT /api/chats/:jid` (mode + Notion/media flags; invalid mode → 400), and `POST /api/chats/:jid/reset` (close in-memory/SQLite session back to IDLE).

#### Scenario: Invalid mode rejected

- **WHEN** `PUT /api/chats/:jid` carries an unknown `autonomy_mode`
- **THEN** the API responds 400 naming the valid modes.

### Requirement: Fail-open permission reads

Permission reads SHALL never crash the pipeline: missing JIDs, locked databases, or absent `messages.db` SHALL fall back to `MENTIONS_ONLY` defaults (or the stored-permissions list when the messages DB is unavailable).

#### Scenario: Locked messages DB

- **WHEN** `messages.db` is WAL-locked during `/api/chats`
- **THEN** the panel still lists the chats that have stored permission rows.
