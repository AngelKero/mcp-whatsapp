# groups-privacy Specification

## Purpose
How group membership and settings, the blocklist, and privacy knobs are administered through the MCP tools, including which mutations require admin and which are irreversible.

## Requirements

### Requirement: Group membership lifecycle

`create_group` SHALL make the paired user admin and notify initial participants; `leave_group` SHALL be permanent (rejoin only via re-add or fresh invite); invite-link reset SHALL permanently invalidate the previous link with no undo.

#### Scenario: Leave is permanent

- **WHEN** the paired user leaves a group
- **THEN** remaining members see a system message and future messages are inaccessible without rejoin.

#### Scenario: Link reset invalidates

- **WHEN** a new invite link is minted with reset
- **THEN** previously shared copies stop working immediately.

### Requirement: Admin-gated mutations

Participant add/remove/promote/demote and announce/locked toggles SHALL require the paired user to be group admin; name/topic/icon edits SHALL require admin OR a non-locked group. Every mutation SHALL surface as a group system message.

#### Scenario: Non-admin post blocked

- **WHEN** announce-only mode is enabled
- **THEN** non-admin send attempts are rejected by the server.

### Requirement: Blocklist reversibility

`block_contact` SHALL be idempotent and reversible via `unblock_contact`; blocked contacts SHALL lose messaging ability and last-seen/profile visibility without explicit notification.

#### Scenario: Double block

- **WHEN** an already-blocked contact is blocked again
- **THEN** the call succeeds idempotently with no side-effect change.

### Requirement: Privacy knobs

Privacy changes SHALL take effect immediately via single-knob updates; invalid name/value combinations SHALL be rejected server-side by WhatsApp. The profile `About` text (`set_status_message`) SHALL be the static profile line, NOT the temporary Status story feed.

#### Scenario: Invalid combination

- **WHEN** an unsupported privacy name/value pair is submitted
- **THEN** the caller receives the server-side rejection rather than a silent no-op.
