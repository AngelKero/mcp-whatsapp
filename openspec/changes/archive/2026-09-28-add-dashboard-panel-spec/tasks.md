# Tasks

## 1. Spec review against code

- [x] 1.1 Review `specs/dashboard-panel/spec.md` against `modules/dashboard/server.js` (routes, port bind, conflict behavior) and verify every Scenario matches implemented behavior
- [x] 1.2 Review autonomy/mode claims against `modules/permissions/chat-permissions.js` (`AUTONOMY_MODES`, `defaultAutonomyMode`, invalid-mode fallback, fail-open reads) and verify each Scenario
- [x] 1.3 Review panel-command claims against `pipeline/middlewares/chat-permissions.middleware.js` (regex variants, owner-only gate, SILENT/killswitch bypass, LAN IP detection) and verify each Scenario

## 2. Validation and regression gates

- [x] 2.1 Run `openspec validate add-dashboard-panel-spec --strict` and verify zero errors
- [x] 2.2 Run `node --test test/unit/chat-permissions.test.js` and verify the permission/mode/panel-command tests pass as spec evidence
- [x] 2.3 Run `make vet` and verify no failures (docs-only change must not break the build)

## 3. Apply and archive

- [x] 3.1 Apply the change (sync the delta into `openspec/specs/dashboard-panel/`) and verify the spec file exists with Purpose intact
- [x] 3.2 Archive `add-dashboard-panel-spec` via `openspec archive` and verify `openspec list` shows no active changes
