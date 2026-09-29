# AGENTS.md — mcp-whatsapp

Single Go binary MCP daemon wrapping `go.mau.fi/whatsmeow` to expose a personal WhatsApp account. `whatsapp-mcp serve` on `127.0.0.1:8765` serves MCP at `/mcp`, pairing UI at `/pair`.

## Build / test / run (copy-paste)

```bash
make build      # ./bin/whatsapp-mcp (tags sqlite_fts5, VERSION via git describe)
make test       # go test ./...
make test-race  # go test -race ./...
make vet        # go vet ./...
make e2e        # build + JSON-RPC smoke (-tags=e2e)
make smoke      # boot-test without WhatsApp connection
./bin/whatsapp-mcp login   # QR in terminal, writes store/whatsapp.db
./bin/whatsapp-mcp serve   # daemon, holds store/.lock (single instance)
```

Go 1.26+. Env: `WHATSAPP_MCP_ADDR`, `WHATSAPP_MCP_TOKEN` (required with `-allow-remote`), `WHATSAPP_MCP_MEDIA_ROOT` (default `./store/uploads/`), `WHATSAPP_MCP_DEBUG=1`.

## Repo map

```
cmd/whatsapp-mcp/       login | serve | smoke
internal/client/        whatsmeow wrapper: send.go, events.go, history.go, features*.go, vcard.go
internal/daemon/        HTTP server, pairing state machine, /pair
internal/mcp/           mark3labs/mcp-go server, tools.go + tools_groups.go + tools_media.go + tools_privacy.go (42 tools)
internal/media/         ogg analysis + ffmpeg shell-out
internal/security/      path allowlist, filename sanitisation, log redaction
internal/store/         SQLite cache + LID resolution (lid.go) + poll.go; seed: internal/store/testdata/seed.sql
scripts/mdtest-parity.sh  whatsmeow API drift canary
openspec/               specs/ = truth, changes/ = proposals (OpenSpec spec-driven)
graphify-out/           graph.html + GRAPH_REPORT.md + graph.json (query-first, don't grep raw)
```

Data: `store/messages.db`, `store/whatsapp.db`, `store/.lock`. Never commit `*.db`, `.env`, media.

## Spec-driven workflow (OpenSpec)

- Skills: `.opencode/skills/openspec-*/`, `.agents/skills/openspec-*/` — invoke `/opsx-propose`, `/opsx-apply`, `/opsx-archive` (opencode/antigravity spelling: `/opsx-propose`).
- CLI: `openspec list`, `openspec validate <change> --strict`, `openspec archive <change>`.
- New capability → `openspec/changes/<verb-kebab>/proposal.md + specs/<cap>/spec.md (ADDED/MODIFIED/REMOVED + Scenario) + tasks.md (- [ ] checkboxes)`.
- Truth lives in `openspec/specs/<cap>/spec.md`. Never edit specs directly — propose → apply → archive.
- See `openspec/AGENTS.md`, `openspec/project.md`, `openspec/config.yaml`.

## Graph-first navigation

- `graphify-out/GRAPH_REPORT.md` is the orientation map (god nodes, communities). Read it before `Glob`/`Grep` on architecture questions.
- `graphify query "<q>"`, `graphify path "A" "B"`, `graphify explain "X"` for traversals.
- After code edits affecting architecture: `/graphify . --update`.

## Go conventions

- `gofmt` clean (`make lint` = vet+fmt). Match existing style in `cmd/`, `internal/`.
- Thin wrappers over whatsmeow: protocol/auth/decrypt bugs belong upstream (`tulir/whatsmeow/issues`), not reimplemented here.
- `internal/store` queries must handle `@lid` via `whatsmeow_lid_map`; outgoing sends persist via `internal/client/send.go`.
- Disappearing timers: group ephemeral via `GetGroupInfo` only; 1:1 timers unsupported by whatsmeow store API.
- Polls: `SendPoll` must use `wa.BuildPollCreation` (MessageSecret required for votes to decrypt).
- Security: `media_path`/`output_path` must stay under `WHATSAPP_MCP_MEDIA_ROOT`; resolve symlinks before check; redact JIDs to last digits in logs.
- Tests: `openTestStore(t)` + `seed.sql` (3 chats, ~12 msgs, media/LID variants). Add/update tests with code changes.
- Weekly `make upgrade-check` bumps whatsmeow; `mdtest parity grep` in CI fails on removed upstream methods.

## MCP tool guidance (42 tools)

Read path: `list_chats` → `list_messages` → `request_sync` (backfill) → `download_media` (always pass `output_path` under shared root for sandboxed clients).
Send path: `send_message` / `send_file` / `send_audio_message` (ffmpeg only for non-ogg) / `send_poll` + `send_poll_vote` + `get_poll_results`.
Actions: `mark_read|mark_chat_read`, `send_reaction|send_reply|edit_message|delete_message`, `send_typing` vs `send_presence`.
Groups/blocklist/privacy in `tools_groups.go`, `tools_media.go`, `tools_privacy.go`. Keep descriptions narrow, include when-NOT-to-use, errors with constraint+fix.
Do NOT add `subscribe_presence`, profile-photo setter, communities/newsletters without proposal.

## What to read before modifying

| Area | Read first |
|---|---|
| Send/store | `internal/client/send.go`, `internal/store/store.go` |
| Events/votes | `internal/client/events.go`, `internal/store/poll.go` |
| Groups/blocklist | `internal/client/features_groups.go` |
| Daemon/pair | `internal/daemon/` |
| Tool surface | `internal/mcp/tools*.go`, `.claude/rules/mcp-tool-descriptions.md` |
| Deploy | `README.md` (launchd/systemd/docker), `docs/windows.md` (CGO) |

## Safety / never do

- Never commit `store/*.db`, `store/.lock`, `.env`, media, QR payloads.
- Never run two `serve` on same `-store` (flock). Never expose non-loopback without `-allow-remote` + `WHATSAPP_MCP_TOKEN`.
- Never print/commit full phone numbers; debug logs mask to last 5 digits (obfuscation, not anonymisation).
- Ask before: public API/tool signature breaks, schema migrations, release tags, destructive DB deletes.
- Releases: semver via git tags (`/release patch|minor|major`), VERSION injected via ldflags. Pre-1.0 minors may break.

## Docs pointers

- Human setup: `README.md`. Contributing: `CONTRIBUTING.md`. Roadmap local: `docs/ROADMAP_INTEGRACIONES.md`.
- Living specs: `openspec/specs/`. Graph report: `graphify-out/GRAPH_REPORT.md`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
