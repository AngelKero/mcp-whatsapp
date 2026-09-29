---
description: Create a conventional commit for mcp-whatsapp (one logical change per commit).
---

Usa el skill `commit` (`$ARGUMENTS` como base del mensaje si viene).

Pasos: `git status --short`, `git diff --stat`, pre-commit gate
(`gofmt -l`, `go vet ./...`, `make build` + `make test` o `make smoke`),
stage solo lo intencional (nunca `store/*.db`, `store/.lock`, `.env`,
media, QR), mensaje `tipo(scope): desc` imperativo.

Si `$ARGUMENTS` está vacío, deriva el mensaje del diff.
No hagas push ni PR salvo que se pida explícito.
