# dashboard-panel Specification

## Purpose
The local web control panel and per-chat autonomy system through which the owner governs what the bot may do in every chat: global killswitch, three autonomy modes with smart defaults, and one-tap session resets.

## Requirements

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

### Requirement: Control parity after redesign

The redesigned SPA SHALL expose every control the current panel has, wired to the same endpoints: global killswitch toggle, per-chat autonomy-mode select (`SILENT`/`MENTIONS_ONLY`/`AUTONOMOUS`), Notion and Media checkboxes, per-chat `IDLE` reset button, name/JID search, group/private/autonomous/muted tabs, and the four status stats (chats, active sessions, classifier health, watcher uptime).

#### Scenario: No control lost

- **WHEN** the redesigned panel loads and fetches `/api/status` and `/api/chats`
- **THEN** killswitch, mode select, both toggles, reset, search, all five tabs, and all four stats are present and operable.

### Requirement: Mobile-first ergonomics

The panel SHALL be fully operable on a 360px-wide phone viewport with no horizontal scrolling; tappable controls SHALL meet a 44px minimum touch target.

#### Scenario: Phone viewport

- **WHEN** the panel is opened at 360px width
- **THEN** all controls remain reachable without horizontal scroll and taps land on their intended targets.

### Requirement: Spanish copy and playful direction

All user-facing copy SHALL remain in Spanish and the panel's palette, motion, and details SHALL follow the chosen Vibrante lúdico direction (bold color, joyful micro-details, playful tone); no dark color scheme is required and English-only controls are forbidden.

#### Scenario: Language check

- **WHEN** scanning visible strings in the served SPA
- **THEN** no English-only control labels or headings are present.

#### Scenario: Direction applied

- **WHEN** the panel loads
- **THEN** bold accent color and playful tone details are visible (verifiable in screenshot review).

### Requirement: Accessibility floor

Every form control SHALL have an associated visible label, body text SHALL meet 4.5:1 contrast, and interactive elements SHALL show a visible focus state for keyboard navigation.

#### Scenario: Labeled controls

- **WHEN** tabbing through the panel with a keyboard
- **THEN** each control announces its purpose and the focused element is visibly highlighted.

### Requirement: Detector-clean handoff

The redesigned panel source SHALL report zero P0 findings from the Impeccable detector before handoff; any remaining lower-severity findings SHALL be recorded as accepted in the change tasks.

#### Scenario: Detector gate

- **WHEN** the detector runs against the panel source at handoff
- **THEN** zero P0 findings are reported.

### Requirement: Per-chat memory controls

The panel SHALL expose per-chat memory controls alongside the existing autonomy controls: a memory `enabled` toggle, a `Generar contexto` bootstrap button (reads recent history once), and a facts view with edit, single delete, and clear-all actions. All labels SHALL be in Spanish and operable at 360px width with 44px touch targets, consistent with the existing mobile-first and Spanish-copy requirements.

#### Scenario: Toggle disables injection

- **WHEN** the owner turns memory OFF for a chat via `PUT /api/chats/:jid/memory` with memory disabled
- **THEN** subsequent turns in that chat receive no stored facts while other chats are unaffected.

#### Scenario: Bootstrap from panel

- **WHEN** the owner taps `Generar contexto` for a chat
- **THEN** `POST /api/chats/:jid/memory/bootstrap` runs and the facts view refreshes with the extracted facts.

#### Scenario: Facts management

- **WHEN** the owner opens a chat's memory view
- **THEN** up to the stored facts list with edit, delete per fact, and clear-all, all confirmed before destructive action.

### Requirement: Memory REST administration

The panel SHALL expose `GET /api/chats/:jid/memory` (settings + facts list), `PUT /api/chats/:jid/memory` (enabled flag + TTL; invalid values → 400), `POST /api/chats/:jid/memory/bootstrap` (`{limit?}` ≤ 50, idempotent), and `DELETE /api/chats/:jid/memory/facts` (single `?id=` or `?all=1` with soft-delete). Failures SHALL fail open: API errors leave the chat operating as memory-disabled, never crash the pipeline or hide existing panel controls.

#### Scenario: Invalid memory patch rejected

- **WHEN** `PUT /api/chats/:jid/memory` carries an unknown field value
- **THEN** the API responds 400 naming the valid values.

#### Scenario: Memory API down keeps panel usable

- **WHEN** the memory store is locked during `GET /api/chats`
- **THEN** the chats list still renders with autonomy controls intact.
