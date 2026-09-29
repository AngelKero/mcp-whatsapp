# Spec Delta

## Purpose

Direct replies from the reactive observer quote the user's triggering message via send_reply by default, so every answer is visibly anchored to what caused it, with automatic fallback to plain send_message when quoting is impossible.

## ADDED Requirements

### Requirement: Trigger reference propagation

The pipeline context SHALL carry the triggering message's `message_id` (stanzaId) and `chat_jid` through every middleware, sourced from the `messages` row that started the turn. Middlewares that enqueue follow-up turns SHALL forward the same reference.

#### Scenario: Reference survives the chain

- **WHEN** a user message with id `ABC123` in chat `X@s.whatsapp.net` traverses anti-echo → permissions → gatekeeper
- **THEN** the dispatch context still holds `message_id=ABC123` and the original `chat_jid`.

#### Scenario: Enqueued burst keeps the last trigger

- **WHEN** a burst of 3 messages is coalesced into one AI turn
- **THEN** the quoted target is the last message of the burst.

### Requirement: send_reply by default on direct answers

When answering a user command or direct trigger (`!buscar`, `!mac`, `!recordar`, `!ia` mention, explicit invocation, gatekeeper quick replies, AI turn replies), the dispatcher SHALL invoke the MCP `send_reply` tool quoting the trigger, in group chats and in 1:1 chats with other people. The sender JID SHALL be included in groups and omitted in 1:1, per the `send_reply` tool contract. The owner's own note-to-self chat (`isMyOwnChat`) SHALL stay floating via `send_message` (self-quotes add noise; pinned by `chat-permissions.test.js`).

#### Scenario: 1:1 command quotes

- **WHEN** the owner sends `!buscar calificaciones` in a 1:1 chat
- **THEN** the result arrives as a quoted reply to that message, not floating.

#### Scenario: Own chat stays floating

- **WHEN** the owner sends `!panel` in the note-to-self chat
- **THEN** the answer arrives via floating `send_message` with no quote attempt.

#### Scenario: Group reply keeps sender

- **WHEN** the bot answers in a group
- **THEN** the reply quotes the trigger AND carries the trigger's sender JID.

### Requirement: Automatic fallback to send_message

When there is no `message_id` (proactive/cron notifications, panel notices, forwarded proposals to the owner) or when `send_reply` fails (invalid/expired reference), the dispatcher SHALL fall back to plain `send_message` and log the fallback. The user-visible outcome is always exactly one delivered message.

#### Scenario: Missing id falls back silently

- **WHEN** the morning briefing dispatcher has no trigger message
- **THEN** it sends via `send_message` without attempting a quote.

#### Scenario: Broken reference falls back

- **WHEN** `send_reply` rejects an expired `target_message_id`
- **THEN** the dispatcher retries once via `send_message` and logs `reply-fallback`.

### Requirement: Proactive notices stay floating

Unsolicited notifications (briefing, finance reports, audits, Notion proposals forwarded to MY_PHONE_JID) SHALL keep using `send_message` and SHALL NOT attempt quotes.

#### Scenario: Audit stays floating

- **WHEN** the nightly Notion audit dispatches its report
- **THEN** the message is sent floating with no `target_message_id`.
