# Spec Delta

## Purpose

Immediate visual feedback while the observer works: an eyes reaction plus typing presence mounted when a turn starts and cleared when it ends, never blocking inference and never echoing.

## ADDED Requirements

### Requirement: Reaction mount on turn start

When `processAiTurn` starts (or a command is expected to take over 500ms), the watcher SHALL react with 👀 to the triggering `messageId` via the MCP `send_reaction` tool, passing the sender JID in groups and omitting it in 1:1, per the tool contract.

#### Scenario: Command gets instant ack

- **WHEN** the owner sends `!mac status` and inference will take seconds
- **THEN** 👀 appears on that message before the response arrives.

#### Scenario: Group reaction carries sender

- **WHEN** the trigger comes from a group
- **THEN** the reaction call includes the trigger's sender JID.

### Requirement: Typing coexistence without flooding

While the turn runs, the existing `TypingPresenceManager` SHALL keep the typing indicator alive (refresh cadence unchanged); reaction mount and typing start SHALL be issued concurrently, not sequentially, so neither delays the other nor the inference.

#### Scenario: Both signals, no added latency

- **WHEN** a turn starts
- **THEN** reaction and typing dispatch together and inference begins immediately after.

### Requirement: Reaction cleanup in finally

After the reply is dispatched — on success or on captured error — the watcher SHALL clear the reaction (empty emoji `""`) in a `finally` block, immediately after the send attempt resolves.

#### Scenario: Cleanup on success

- **WHEN** the AI reply is delivered
- **THEN** 👀 is removed from the trigger right after.

#### Scenario: Cleanup on error

- **WHEN** inference throws and the error reply path runs
- **THEN** 👀 is still removed (no orphaned eyes).

### Requirement: Strict fail-open on reaction errors

If `send_reaction` (mount or cleanup) fails for any reason — transient disconnect, expired/ephemeral target — the watcher SHALL log one discreet line and continue inference or delivery uninterrupted. A reaction failure SHALL never suppress, duplicate, or delay the user's reply.

#### Scenario: Daemon down at mount

- **WHEN** `send_reaction` throws at turn start
- **THEN** the turn proceeds normally and the reply still arrives.

### Requirement: No reaction echo or loops

Reaction activity SHALL NOT create processable turns: inbound reactions carry no text content and are skipped by the watcher's content filter, and the bot's own sent IDs are discarded by anti-echo. Mounting or clearing a reaction SHALL NOT enqueue any pipeline work.

#### Scenario: Own eyes cause nothing

- **WHEN** the bot's 👀 lands on a message
- **THEN** no new turn starts and no reply is generated.
