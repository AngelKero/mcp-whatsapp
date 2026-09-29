# Spec Delta

## ADDED Requirements

### Requirement: Per-chat memory controls

The panel SHALL expose per-chat memory controls alongside the existing autonomy controls: a memory `enabled` toggle, a `Generar contexto` bootstrap button (reads recent history once), and a facts view with edit, single delete, and clear-all actions. All labels SHALL be in Spanish and operable at 360px width with 44px touch targets, consistent with the existing mobile-first and Spanish-copy requirements.

#### Scenario: Toggle disables injection

- **WHEN** the owner turns memory OFF for a chat via `PUT /api/chats/:jid` with memory disabled
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
