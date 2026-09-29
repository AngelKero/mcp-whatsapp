# Tasks

## 1. Spec review against code

- [x] 1.1 Review `specs/media-pipeline/spec.md` against `internal/media/audio.go`, `internal/security/paths.go`, and `registerSendPoll`/`registerDownloadMedia` validation strings, and verify every Scenario matches implemented behavior
- [x] 1.2 Review `specs/history-sync/spec.md` against `registerRequestSync` (anchors, `use_lid`, timestamp parsing) and verify error strings match (`chat_jid: required`, `invalid from_timestamp`, `must not be negative`)
- [x] 1.3 Review `specs/groups-privacy/spec.md` against `internal/client/features_groups.go` and `tools_groups.go`/`tools_privacy.go`, and verify admin-gating and irreversibility claims
- [x] 1.4 Review `specs/security-allowlist/spec.md` against `internal/security/paths.go`, `redactor.go`, daemon bind guard, and `/pair` rate limiter, and verify each Scenario is observable

## 2. Validation and regression gates

- [x] 2.1 Run `openspec validate add-core-specs --strict` and verify zero errors (Purpose length, Scenario format, ADDED headers)
- [x] 2.2 Run `make vet` and `make test` and verify no failures (docs-only change must not break the build)
- [x] 2.3 Run `make e2e` and verify the poll/sync/LID harnesses still pass as spec evidence
- [x] 2.4 Run the whatsmeow parity grep (`scripts/mdtest-parity.sh` or CI equivalent) and verify no upstream drift affects cited method names

## 3. Apply and archive

- [x] 3.1 Apply the change (sync the four deltas into `openspec/specs/`) and verify the new spec files exist with Purpose intact
- [x] 3.2 Archive `add-core-specs` via `openspec archive add-core-specs` and verify `openspec list` shows no active changes
