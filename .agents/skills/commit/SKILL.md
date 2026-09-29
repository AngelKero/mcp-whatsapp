---
name: commit
description: Create conventional commits for mcp-whatsapp. Use when committing Go changes, opening a PR, or user says commit, commit-push-pr.
---

# /commit

Un cambio lógico por commit. Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`) como en `git log --oneline`.

## Workflow

1. Inspecciona estado real, no inventes:
   - `git status --short`
   - `git diff --stat && git diff`
   - `git log --oneline -5` (para estilo)
2. Pre-commit gate (repo Go + tags sqlite_fts5):
   - `gofmt -l internal/ cmd/ e2e/`
   - `go vet ./...`
   - `make build` y `make test` (o `make smoke` si no hay sesión WhatsApp)
   - Si hay OpenSpec change activo: `openspec validate <change> --strict`
3. Stage solo lo intencional. Nunca:
   - `store/*.db`, `store/.lock`, `.env`, media, QR payloads
   - lockfiles editados a mano (`go.sum` solo via `go mod tidy`)
4. Mensaje: `tipo(scope): descripción corta` en inglés, imperativo.
   Ej: `fix(lid): resolve device-suffixed LIDs`
5. Un commit por PR salvo que el usuario pida push/PR explícito.
   Para push+PR usa `gh pr create` y linkea el issue que cierra.

## $ARGUMENTS

Si `$ARGUMENTS` trae scope o mensaje, úsalo como base. Si viene vacío,
derívalo del diff. Nunca dejes el mensaje vacío.
