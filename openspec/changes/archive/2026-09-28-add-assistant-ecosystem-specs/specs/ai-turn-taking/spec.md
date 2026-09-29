# Spec Delta

## Purpose

Orchestrates multi-turn conversation state transitions, ambient listening, zero-cost fast paths, and dynamic model routing.

## ADDED Requirements

### Requirement: Adaptive three-state conversation lifecycle

The system SHALL manage per-chat conversation state across three distinct phases: `IDLE` (dormant, ignoring third-party speech), `ACTIVE` (hot interactive window of 90 seconds for continuous conversational exchanges without triggers), and `LURK_MODE` (ambient listening window from 90 seconds up to 15 minutes).

#### Scenario: Continuous dialogue in active state
- **WHEN** the user replies within 30 seconds of an AI response
- **THEN** the turn is processed immediately without requiring `@antigravity` or `!ia` prefixes.

#### Scenario: Active state decay to lurk mode
- **WHEN** 90 seconds elapse without a direct user turn in an active chat
- **THEN** the session state decays from `ACTIVE` to `LURK_MODE`.

### Requirement: Ambient buffer and intelligent chime-in evaluation

In `LURK_MODE`, the system SHALL store incoming messages in an SQLite ambient buffer; when a new message arrives, the system SHALL check for human-to-human vocatives and evaluate with the local Laya-MLX model whether the participant is asking for assistant intervention (requiring $\ge 0.85$ confidence).

#### Scenario: Chime-in triggered in group discussion
- **WHEN** participants in lurk mode discuss a factual question and ask `cómo se llamaba el protocolo de enrutamiento que vimos?`
- **THEN** Laya-MLX triggers a chime-in, promoting the state back to `ACTIVE` and answering the query with context.

#### Scenario: Human vocative suppresses intervention
- **WHEN** a message includes a vocative directed at a person (e.g., `oye Angel, qué opinas?`)
- **THEN** the system forces silence and does not intervene.

### Requirement: Zero-cost fast-path for trivial messages

The system SHALL evaluate short acknowledgments, laughter, and greetings using local classifiers, returning canned responses (e.g., `¡De nada, Angel! :3`, `xd :3`, `Sale :3`) without invoking the high-tier language model CLI.

#### Scenario: Trivial thanks received
- **WHEN** the owner replies `gracias!` after a completed action
- **THEN** the system replies `¡De nada, Angel! :3` in <30ms without invoking the external LLM.

### Requirement: Complexity-based dynamic model routing

The system SHALL classify the complexity of non-trivial messages using the local model into `trivial`, `simple`, `complex`, or `expert`, selecting the optimal model tier (`gemini-3.8-flash-low`, `medium`, `high`, or `gemini-3.1-pro-low`) before invoking the assistant CLI.

#### Scenario: Complex coding task
- **WHEN** a user prompt asks for multi-step script refactoring or database debugging
- **THEN** complexity is classified as `complex` or `expert` and dispatched to the corresponding higher-tier model.

### Requirement: Graceful farewell session termination

When the user emits closing phrases (e.g., `muchas gracias`, `bye`, `nos vemos`, `me voy a mimir`, `buenas noches`), the system SHALL reply politely and transition the session state directly to `IDLE`, freeing memory and closing hot windows.

#### Scenario: User says goodnight
- **WHEN** the user sends `me voy a mimir, gracias!`
- **THEN** the system replies with a farewell and closes the session to `IDLE`.
