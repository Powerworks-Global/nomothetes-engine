# ADR 0003: Agentic Modeling writes to the committed board JSON, not localStorage

**Status:** Accepted, 2026-09-23

## Context

[docs/plan.md](../plan.md) Phase 4 (Agentic Modeling) and [ADR 0002](0002-mcp-export-over-per-harness-adapters.md) both explicitly deferred this: a task-queued, skill-routed agent that edits the board itself, pattern transposed from PowerGym's own `agentic-modeling/` tooling, reusing AgentOS's existing task-queue implementation rather than building a second one from scratch.

The board today has two separate stores, not one:

- **Layer 1** (nodes/edges): a committed JSON file, `src/data/powergym-board.json`, read by both the React app (`src/loadBoard.ts`) and the Node.js MCP server via plain `fs.readFileSync`.
- **Layer 2** (Example Map cards): only in browser `localStorage`, unless a slice has a `seedExampleMaps[sliceId]` entry baked into the same committed JSON by the import adapter.

There is currently no write path from either the canvas or the MCP server back to the board data at all (`docs/solution-architecture.md`). An agent that "edits the board" has to write *somewhere real* — and the MCP server is a Node.js process with no access to a browser's `localStorage`.

## Decision

The MCP server becomes the write authority for both layers, writing directly to `src/data/powergym-board.json` (including its `seedExampleMaps` map for Layer 2 cards). Each write tool re-reads the file fresh before mutating — not the stale module-load snapshot the read-only tools use — and writes back via `writeFileSync`.

Human-driven browser edits keep using `localStorage` independently. Real-time reconciliation between agent writes (to disk) and live browser state (in `localStorage`) is explicitly out of scope for v1.

## Reasoning

The task-queued shape (PowerGym's `tasks.json` loop, one task claimed and processed at a time, results appended to a progress log) is inherently asynchronous, not a live collaborative-editing session — a human and an agent are not expected to be mutating the same board at the same instant. Given that, the committed JSON file is the only real, durable place for an out-of-process agent to write to; trying to bridge into `localStorage` (e.g. via a running dev-server endpoint) would add real complexity for a synchronization problem this feature doesn't actually have yet.

## Consequences

- If a human has unsaved Layer 2 edits in `localStorage` for a slice the agent also writes to via `seedExampleMaps`, those two states can diverge. Nothing today detects or resolves that conflict — a real limitation, not silently ignored. Worth revisiting once/if live co-editing is ever in scope.
- The committed JSON file becomes writable by an automated process for the first time — file-level version control (git) is the only audit trail for agent writes beyond the task queue's own `progress.txt` log.
- `/update-slice-status` is out of scope for this pass since the underlying "ready" status toggle it would need doesn't exist in the codebase yet (flagged separately in `docs/plan.md` as planned-but-never-built).
