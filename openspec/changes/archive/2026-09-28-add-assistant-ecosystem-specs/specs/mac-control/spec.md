# Spec Delta

## Purpose

Enables remote SysAdmin management and physical device discovery of the host macOS machine via authenticated WhatsApp text commands.

## ADDED Requirements

### Requirement: System status and metrics query

The system SHALL parse `!mac status`, `!mac bateria`, `!mac battery`, and `!mac stats` to extract real-time battery percentage, AC power status, CPU load percentage, RAM usage (used and free), primary disk space utilization, and system uptime from the host macOS operating system, returning a formatted summary message.

#### Scenario: Host metrics retrieved successfully
- **WHEN** the authorized owner sends `!mac status`
- **THEN** the system replies with battery percentage, power connection state, CPU/RAM metrics, disk usage, and uptime without error.

### Requirement: Acoustic discovery ping

The system SHALL support `!mac ping` to set the macOS system output volume to 100% and immediately play the native alert sound `/System/Library/Sounds/Ping.aiff` to physically locate a misplaced device.

#### Scenario: Ping triggered by owner
- **WHEN** the authorized owner sends `!mac ping`
- **THEN** system audio is unmuted, output volume is set to maximum, the ping sound plays, and a confirmation is sent back to the chat.

### Requirement: Session screen locking

The system SHALL support `!mac lock` to immediately put the display to sleep and lock the active macOS user session via `pmset displaysleepnow`.

#### Scenario: Lock triggered by owner
- **WHEN** the authorized owner sends `!mac lock`
- **THEN** the display enters sleep mode immediately and a confirmation is returned to WhatsApp.

### Requirement: Silent screen capture

The system SHALL support `!mac screen` and `!mac screenshot` to capture the current macOS desktop display silently via `screencapture -x` to a temporary image file, transmit the image file via WhatsApp to the requesting chat, and unlink the temporary file.

#### Scenario: Screen capture delivered
- **WHEN** the authorized owner sends `!mac screen`
- **THEN** a screenshot of the active screen is captured, delivered as an image attachment, and cleaned from temporary storage.

### Requirement: Strict owner authorization guard

The system MUST enforce that `!mac` commands are only executed when originating from the verified owner JID (`isFromAngel` or `isMyOwnChat`). Any attempt from other participants or group members MUST be rejected with an access-denied message.

#### Scenario: Unauthorized participant command attempt
- **WHEN** a third party or non-owner sender issues `!mac status` in a direct or group chat
- **THEN** execution is halted and a notification stating access is denied is returned.

### Requirement: Command help menu

The system SHALL reply with an interactive syntax guide explaining all available `!mac` subcommands when `!mac help` or an unrecognized subargument is received from the owner.

#### Scenario: Help requested
- **WHEN** the owner sends `!mac help`
- **THEN** the system returns a list of supported subcommands (`status`, `ping`, `lock`, `screen`) with descriptions.
