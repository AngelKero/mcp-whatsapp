# Spec Delta

## Purpose

Establishes an automated scenario verification harness, actionable MCP tool error feedback, and specialized subagent operational profiles.

## ADDED Requirements

### Requirement: Automated scenario verification test harness

The system SHALL provide an automated test suite (`openspec-scenarios.test.js`) executed with `node --test` that verifies the normative `#### Scenario:` statements declared across OpenSpec capability specifications using deterministic synthetic fixtures without requiring physical devices or active WhatsApp connections.

#### Scenario: Running scenario verification suite
- **WHEN** the test command `node --test test/unit/openspec-scenarios.test.js` is executed
- **THEN** all scenario test cases for mac-control, passive-extractor, chat-search, school-notices, and proactive-pulse pass with zero failures.

### Requirement: Actionable MCP tool error reporting

When an MCP tool encounters invalid input arguments or validation failures, the system SHALL return a `CallToolResult` with `isError: true` containing the error summary, the exact failed constraint, and an actionable suggested fix instruction for the model.

#### Scenario: Invalid argument supplied to MCP tool
- **WHEN** a client invokes `send_message` with an empty recipient JID or empty message body
- **THEN** the tool returns an error result detailing the missing argument and an example of the valid syntax.

### Requirement: Architecture Decision Record preservation

The repository SHALL maintain Architecture Decision Records under `docs/adr/` documenting the rationale, trade-offs, and alternatives for foundational design decisions (Laya-MLX local execution, SQLite WAL concurrency, native macOS voice synthesis, and Token Bucket Notion queue) to prevent accidental regressions during autonomous agent refactoring.

#### Scenario: Agent reviews architecture rationale
- **WHEN** an AI agent inspects `docs/adr/`
- **THEN** it finds structured ADRs outlining context, decision, and consequences for all foundational subsystems.

### Requirement: Specialized subagent role governance

The system SHALL define explicit operational roles under `.opencode/agents/` (`architect.md`, `implementer.md`, `qa-reviewer.md`) delineating allowed tools, responsibilities, and handoff protocols between planning, coding, and verification phases.

#### Scenario: Agent role definition checked
- **WHEN** an agent is initialized with a specific role
- **THEN** its system prompt restricts its scope to its defined phase of the development lifecycle.
