# Design

## Context

See `proposal.md` (Why). The repository needs machine-executable scenario tests, preserved architectural decisions, informative MCP errors, and defined subagent boundaries. This design addresses all five recommendations within the existing Go and Node.js codebases.

## Goals / Non-Goals

**Goals:**
- Provide a deterministic scenario verification runner using `node:test` that checks OpenSpec behavior contracts against mocks.
- Add structured error helpers in `internal/mcp/result.go` without breaking MCP JSON-RPC protocol compliance.
- Record foundational engineering choices in standard ADR format.
- Equip Makefile with graph sync and unified test targets.

**Non-Goals:**
- No changes to whatsmeow wire protocol, SQLite schema, or live daemon ports.

## Decisions

### 1. Spec-to-Test Runner Architecture
- **Decision**: `test/unit/openspec-scenarios.test.js` imports pipeline middlewares and modules directly (`macControlMiddleware`, `passiveExtractor`, `chatHistorySearch`, `schoolNoticeMiddleware`, `proactivePulseEngine`), supplying synthetic context objects and validating response payloads against OpenSpec scenarios.
- **Rationale**: Direct middleware invocation bypasses WhatsApp network latency and database polling while testing 100% of business logic.

### 2. Actionable MCP Tool Errors
- **Decision**: In `internal/mcp/result.go`, implement `ToolErrorWithFix(err error, failedConstraint string, suggestedFix string)` returning:
  ```go
  &mcp.CallToolResult{
      IsError: true,
      Content: []mcp.Content{
          mcp.NewTextContent(fmt.Sprintf("Error: %v\nConstraint failed: %s\nSuggested fix: %s", err, failedConstraint, suggestedFix)),
      },
  }
  ```
  Applied when validating arguments before calling whatsmeow primitives (`SendMessage`, `Upload`, etc.).
- **Rationale**: When an agent receives an actionable fix instruction in the error payload, it self-corrects on the next turn instead of hallucinating.

### 3. Architecture Decision Records (ADRs)
- **Decision**: Use Michael Nygard's ADR format (Title, Status, Context, Decision, Consequences) in `docs/adr/`.
- **Rationale**: Industry standard, easy for LLMs to ingest in single-shot context.

## Risks / Trade-offs

- [Risk] Mock drift between synthetic test context and live messages in `messages.db` → Mitigation: Synthetic context objects use exact column names matching SQLite `messages` schema (`chat_jid`, `sender`, `content`, `is_from_me`, `quoted_message_id`).
- [Risk] MCP tool error changes breaking existing MCP client parsing → Mitigation: Return value remains standard `*mcp.CallToolResult` with `IsError: true` and text content, preserving full protocol compatibility.

## Migration Plan

Zero migration. Tests run on demand. Revert via git if needed.
