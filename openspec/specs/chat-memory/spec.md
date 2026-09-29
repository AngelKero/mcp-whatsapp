# chat-memory Specification

## Purpose

Persistent per-chat factual memory that lets every WhatsApp chat remember durable context about its person across sessions, with explicit user controls to enable, inspect, bootstrap, and erase it.

## Requirements

### Requirement: Per-chat fact storage with session survival

The system SHALL maintain durable facts per chat JID (normalized via LID resolution) that persist across watcher restarts and new sessions, and SHALL inject the relevant facts at the start of each turn. Facts carry key, value, category (`profile|preference|commitment|fact`), scope (`self|group|global`), source message id, timestamps, and soft-delete marker.

#### Scenario: Facts survive restart

- **WHEN** chat `1234@s.whatsapp.net` has stored `hijo: se llama Mateo` and the watcher restarts
- **THEN** the next turn in that chat still receives `hijo: se llama Mateo` in its context.

#### Scenario: Isolation between chats

- **WHEN** chat A stores `alergia: nuez` and chat B opens a new session
- **THEN** chat B's context never contains `alergia: nuez`.

### Requirement: Post-turn durable extraction

After each assistant reply, the system SHALL evaluate the user+assistant exchange and persist 0–3 new facts ONLY when the exchange contains durable information (identity, preferences, commitments with date, stable constraints). Banter, presence statements, and transient chatter SHALL NOT create facts.

#### Scenario: Durable preference stored

- **WHEN** the user says `soy vegetariano, recuérdalo`
- **THEN** a `preference` fact is stored and confirmed.

#### Scenario: Banter ignored

- **WHEN** the user says `ya me voy a dormir` or `aquí ando en el centro`
- **THEN** no fact is created.

### Requirement: Pre-turn context injection under budget

Before each LLM call, the system SHALL compose context as: structured profile lines (always, compact) + up to 8 topical facts matching the current message + recent verbatim window (10–15 messages). Total injected memory SHALL stay under a configured token budget; facts beyond budget are omitted by recency+relevance rank, never by failing the turn.

#### Scenario: Budget enforced

- **WHEN** a chat holds 40 facts and a new message arrives
- **THEN** the turn still completes with at most the top-ranked facts within budget.

#### Scenario: Disabled chat injects nothing

- **WHEN** memory is disabled for a JID
- **THEN** no stored facts are injected into that chat's turns.

### Requirement: Explicit chat commands

The system SHALL support `!recordar <dato>`, `!olvidar <texto|todo>`, `!memoria`, and `!reset-memoria`. `!recordar` stores verbatim; `!memoria` lists up to 8 facts; `!olvidar <texto>` fuzzy-matches ONE fact, shows it, and deletes ONLY on explicit `sí` confirmation; `!olvidar todo` requires confirmation and soft-deletes all facts of that JID. In groups, `!recordar/!olvidar/!memoria` from non-owners SHALL be ignored (same authorization rule as `!buscar`).

#### Scenario: Explicit remember

- **WHEN** the owner sends `!recordar mi hijo se llama Mateo`
- **THEN** the fact is stored and the bot confirms what it saved.

#### Scenario: Fuzzy forget with confirmation

- **WHEN** the owner sends `!olvidar lo de la alergia`
- **THEN** the bot shows the matched fact and waits for confirmation before deleting.

#### Scenario: Third party blocked in group

- **WHEN** a non-owner sends `!memoria` in a group
- **THEN** the command is ignored and passes through the pipeline.

### Requirement: One-shot bootstrap from recent history

The system SHALL offer a bootstrap operation per JID that reads up to the last 50 messages from `messages`, runs long-range extraction once with original timestamps, and writes facts idempotently (re-run with same source ids creates no duplicates). Bootstrap SHALL run offline without blocking the hot message path.

#### Scenario: Bootstrap fills context

- **WHEN** bootstrap runs on a chat with 50 prior messages mentioning `cita dentista viernes`
- **THEN** a `commitment` fact exists afterwards and a second bootstrap run adds zero duplicates.

### Requirement: Erasure and audit

Deleting a fact SHALL soft-delete (`deleted_at` set, excluded from retrieval and indexes) and remain recoverable until purged. `!olvidar todo` and panel Clear SHALL soft-delete all facts of that JID. Every write/delete/bootstrap SHALL append a `memory_events` row (before/after, reason, timestamp).

#### Scenario: Forget is reversible until purge

- **WHEN** a fact is forgotten
- **THEN** it no longer appears in context or `!memoria`, but its event row records what was removed and when.
