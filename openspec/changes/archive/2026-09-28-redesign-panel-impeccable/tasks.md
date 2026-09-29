# Tasks

## 1. Impeccable discovery and build

- [x] 1.1 Run `/impeccable shape` for the panel SPA and verify a recorded design direction exists before building (timebox discovery; defaults: Vibrante lúdico, Spanish, mobile-first)
- [x] 1.2 Rebuild `SPA_HTML` in `modules/dashboard/server.js` per the chosen direction and verify the file still runs under plain `node` with no new dependencies (`node --check modules/dashboard/server.js`)
- [x] 1.3 Run `/impeccable polish` on the rebuilt SPA and verify the skill reports its changes against the existing design constraints

## 2. Parity and quality gates

- [x] 2.1 Verify control parity: load the panel against the live watcher and confirm killswitch, mode select, Notion/Media toggles, IDLE reset, search, all five tabs, and all four stats render and operate
- [x] 2.2 Verify mobile ergonomics at 360px width (no horizontal scroll, 44px touch targets) with a phone-viewport screenshot saved as apply evidence
- [x] 2.3 Run `/impeccable audit` plus the detector against the panel source and verify zero unaccepted P0 findings (record any accepted ones here with reason)
- [x] 2.4 Run `node --test --test-concurrency=1 test/unit/chat-permissions.test.js` and verify 20/20 pass (panel behavior contract unchanged)
- [x] 2.5 Run `make vet` and verify no failures (docs-plus-SPA change must not break the build)

## 3. Handoff evidence

- [x] 3.1 Capture before/after screenshots (1440px desktop + 360px phone) and `curl` snapshots of `/api/status` and `/api/chats` proving payload parity, and verify all four artifacts are attached to the apply summary
