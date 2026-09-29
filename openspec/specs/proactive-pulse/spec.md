# proactive-pulse Specification

## Purpose
Drives an autonomous background heartbeat providing predictive task deadline warnings, university departure notices, and low-battery alerts.

## Requirements

### Requirement: Predictive deadline warnings

The system SHALL check cached Notion tasks during every heartbeat pulse and dispatch predictive alerts when active tasks have due dates within a 5-hour window (270–330 minutes) or a 2-hour critical window (90–135 minutes), consolidating multiple tasks when applicable.

#### Scenario: Single 5-hour task warning
- **WHEN** an incomplete task has a due date 5 hours from the current time
- **THEN** the system sends a friendly reminder to WhatsApp with the task title, deadline time, and contextual tip.

#### Scenario: Multiple tasks due in 2 hours
- **WHEN** three tasks have due dates within 2 hours
- **THEN** a consolidated critical alert listing all three tasks is delivered.

### Requirement: University class departure alerts

The system SHALL determine whether the owner has an upcoming university class starting in 35 to 55 minutes and dispatch an alert including the course title, assigned classroom, and instructor name.

#### Scenario: Class starting in 45 minutes
- **WHEN** a scheduled class begins in 45 minutes on the current day
- **THEN** the system delivers a departure notification reminding the owner to head to the university campus with room details.

### Requirement: Critical battery discharge monitoring

The system SHALL monitor the host MacBook power status via `pmset` and dispatch an alert when the laptop is discharging and the battery level drops to 20% or lower.

#### Scenario: Host laptop discharging below threshold
- **WHEN** the MacBook Air is disconnected from AC power and reaches 18% battery
- **THEN** an alert is sent via WhatsApp and displayed natively on macOS prompting the owner to connect the charger.

### Requirement: SQLite pulse idempotency and multi-channel delivery

The system MUST record all dispatched signals in an SQLite table (`dispatched_pulses`) keyed by category, entity ID, and time bucket to guarantee that duplicate alerts are never dispatched within the same monitoring cycle; alerts SHALL be mirrored via macOS display notifications.

#### Scenario: Duplicate heartbeat cycle
- **WHEN** a pulse cycle runs 25 seconds after an alert was dispatched for a 5-hour deadline
- **THEN** the system checks `dispatched_pulses`, detects the existing record, and skips duplicate dispatching.
