---
name: wa-e2e
description: Run end-to-end JSON-RPC smoke against the daemon. Use when verifying MCP tool surface, send paths, or release readiness.
---

## What I do

- Build + boot + speak JSON-RPC over HTTP to `/mcp`.
- Verify send/read/admin tool paths.

## Instructions

1. Run `make e2e` (builds binary, `-tags=e2e`). Fallback `make smoke` for no-WhatsApp boot-test.
2. If `another whatsapp-mcp instance is already running`, stop stray `serve` or use different `-store`.
3. For poll changes verify `wa.BuildPollCreation` path + vote tally includes 0-vote options.
4. For media changes verify allowlist rejection with clear error + `output_path` copy.
5. Report failing tool name + JSON-RPC `isError` text verbatim.
