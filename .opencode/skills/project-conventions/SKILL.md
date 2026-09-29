---
name: project-conventions
description: Go conventions for mcp-whatsapp. Apply when writing or reviewing Go code in cmd/, internal/, e2e/.
---

# project-conventions

Background knowledge, no efectos laterales. Claude/opencode lo aplica solo.

## Thin wrappers over whatsmeow

- No reimplementar protocolo/auth/decrypt. Bugs de protocolo van a
  `tulir/whatsmeow/issues`, no aquí.
- Polls: `SendPoll` debe usar `wa.BuildPollCreation` (MessageSecret
  requerido para que los votos descifren).

## Store / LID / media

- Queries en `internal/store` deben resolver `@lid` via
  `whatsmeow_lid_map` (`internal/store/lid.go`).
- Sends salientes persisten via `internal/client/send.go`.
- Timers disappearing: solo grupos via `GetGroupInfo`. 1:1 no soportado
  por la store API de whatsmeow.
- `media_path`/`output_path` siempre bajo `WHATSAPP_MCP_MEDIA_ROOT`
  (default `./store/uploads/`). Resolver symlinks antes del check.
- En logs, redactar JIDs a últimos dígitos. Nunca full phones en commits.

## Tests

- Patrón: `openTestStore(t)` + `internal/store/testdata/seed.sql`
  (3 chats, ~12 msgs, variantes media/LID).
- Todo cambio de código trae test nuevo o actualizado.
- `make test`, `make test-race`, `make vet`. E2E con `-tags=e2e`.

## Specs / grafo

- Truth en `openspec/specs/`. Nunca editar specs directo:
  propose → apply → archive.
- Tras cambios de arquitectura: sugerir `/graphify . --update`.

## Prohibido

- Dos `serve` sobre el mismo `-store` (flock en `store/.lock`).
- Exponer non-loopback sin `-allow-remote` + `WHATSAPP_MCP_TOKEN`.
- Commitear `store/*.db`, `store/.lock`, `.env`, media, QR.
