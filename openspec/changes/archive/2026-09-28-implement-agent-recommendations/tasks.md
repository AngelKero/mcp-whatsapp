# Tasks

## 1. Spec-to-Test Scenario Suite

- [x] 1.1 Create `test/unit/openspec-scenarios.test.js` covering `mac-control`, `passive-extractor`, `chat-search`, `school-notices`, and `proactive-pulse` scenarios
- [x] 1.2 Verify `openspec-scenarios.test.js` passes cleanly with `node --test test/unit/openspec-scenarios.test.js`

## 2. Architecture Decision Records (ADRs)

- [x] 2.1 Create `docs/adr/ADR-001-laya-mlx-local-metal.md` documenting local Laya-MLX vs Cloud LLMs
- [x] 2.2 Create `docs/adr/ADR-002-sqlite-wal-single-writer.md` documenting SQLite WAL and single daemon flock
- [x] 2.3 Create `docs/adr/ADR-003-native-macos-voice-tts.md` documenting Paulina TTS and Opus PTT encoding
- [x] 2.4 Create `docs/adr/ADR-004-token-bucket-queue-notion.md` documenting Notion Token Bucket rate limiting

## 3. MCP Tool Error Ergonomics

- [x] 3.1 Implement `ToolErrorWithFix` in `internal/mcp/result.go`
- [x] 3.2 Update parameter validation in `internal/mcp/tools_send.go` to use `ToolErrorWithFix`
- [x] 3.3 Add unit test for `ToolErrorWithFix` in `internal/mcp/result_test.go` and verify with `make vet` and `make test`

## 4. Makefile and Knowledge Graph Automation

- [x] 4.1 Add `graph-update` and `test-all` targets to `Makefile`
- [x] 4.2 Verify `make test-all` executes the full test matrix

## 5. Subagent Specialization

- [x] 5.1 Create `.opencode/agents/architect.md` defining system planning boundaries
- [x] 5.2 Create `.opencode/agents/implementer.md` defining implementation boundaries
- [x] 5.3 Update `.opencode/agents/qa-reviewer.md` defining verification criteria

## 6. OpenSpec Validation and Archive

- [x] 6.1 Validate change with `openspec validate implement-agent-recommendations --strict`
- [x] 6.2 Archive change with `openspec archive implement-agent-recommendations -y`

