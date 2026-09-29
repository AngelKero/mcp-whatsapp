# quote-wake-retention Specification

## Purpose

Quote-to-bot wakeups keep working no matter how old the quoted bot message is, preserving the current O(1) no-inference cost of wake detection.

## Requirements

### Requirement: Hot retention of sent IDs for 7 days

The tracker SHALL retain `sent_messages` rows for 7 days (`sentIdsTtlMs`) so quotes to bot messages from the last week resolve on the hot path. The existing opportunistic purge SHALL keep running unchanged, only with the new threshold.

#### Scenario: Week-old quote wakes on hot path

- **WHEN** a user quotes a bot message sent 3 days ago
- **THEN** `hasSentId` returns true from `sent_messages` without touching history.

### Requirement: Fallback to own history for older quotes

When an ID is absent from `sent_messages` (purged or beyond preload), `hasSentId` SHALL perform one indexed fallback lookup in `messages` (`WHERE id=? AND is_from_me=1`) and return true on a hit. The fallback SHALL be read-only and SHALL NOT resurrect purged rows.

#### Scenario: Month-old quote wakes via fallback

- **WHEN** a user quotes a bot message sent 40 days ago (long purged)
- **THEN** the fallback finds the own-message row and the turn wakes as `isQuotedToBot`.

#### Scenario: Unknown ID stays negative

- **WHEN** the quoted ID exists in neither store
- **THEN** `hasSentId` returns false and the turn follows the normal pipeline.

### Requirement: No behavior change for echo suppression and reaction guard

The pure-reaction guard (`jaja`/`xd`/emoji quoting the bot SHALL NOT wake) and anti-echo suppression of own sent IDs SHALL behave exactly as today. The fallback SHALL NOT enqueue work, write rows, or warm caches beyond the single answering lookup.

#### Scenario: Laugh-quote still sleeps

- **WHEN** a user replies `jajaja` quoting a month-old bot message
- **THEN** no wake occurs.
