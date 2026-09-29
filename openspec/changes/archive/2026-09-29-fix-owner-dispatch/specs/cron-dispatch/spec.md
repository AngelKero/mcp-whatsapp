# Spec Delta

## Purpose

Sensitive personal dispatches belong to the owner alone: agenda, finances and audits never reach third-party chats, and scheduled crons actually deliver to a verified recipient.

## ADDED Requirements

### Requirement: Hardened cron recipient and verified delivery

Scheduled dispatches (morning briefing, Sunday finance report, nightly audit) SHALL resolve the recipient from hardened owner identity (env with safe fallback, never empty) and SHALL verify delivery (message ID / `Success`) instead of logging unconditional success. A failed dispatch SHALL log a visible error and SHALL NOT mark the day as done when the check allows a retry.

#### Scenario: Briefing verifies delivery

- **WHEN** the 08:00 cron fires with the daemon reachable
- **THEN** the briefing row lands in the owner's chat and the log shows the delivered ID.

#### Scenario: Failed send is loud and retryable

- **WHEN** the daemon rejects the briefing send
- **THEN** an error names the recipient and the day is not marked done, so catch-up retries.

#### Scenario: Nightly audit reaches the owner

- **WHEN** the 03:00–05:00 audit completes
- **THEN** its report message is delivered to the owner's chat the same night.
