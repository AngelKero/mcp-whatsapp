---
trigger: glob
globs: "internal/store/*.go, internal/store/testdata/*.sql"
description: SQLite cache, LID resolution, and poll tables.
---

# Store conventions

- Queries must resolve `@lid` via `whatsmeow_lid_map` (`internal/store/lid.go`).
- Outgoing sends persist via `internal/client/send.go`; keep history complete.
- Poll votes live in `poll_votes` + `messages.poll_options_json` (`internal/store/poll.go`).
- Tests use `openTestStore(t)` + `testdata/seed.sql` (3 chats, ~12 msgs, media/LID variants). Extend both with schema changes.
- Ask before migrations, destructive deletes, or breaking tool signatures.
