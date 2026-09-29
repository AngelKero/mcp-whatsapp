# Spec Delta

## ADDED Requirements

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
