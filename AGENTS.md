# AGENTS.md

Repository rules for any coding agent (Claude Code, Codex, or otherwise) working in `nomothetes-engine` ("Nomothetes", renamed from `storyboard-canvas-spike`/"EUnomia" on 2026-10-04). See [CONTRIBUTING.md](CONTRIBUTING.md) for the fuller convention set this file summarizes.

## Commands

```bash
npm install
npm run dev      # canvas at http://localhost:5173
npm run build    # typecheck + production build
npm run lint      # oxlint
npm run test      # vitest
```

## Working conventions

- **Real data over synthetic examples.** Build and test against PowerGym's actual imported board data (`src/data/powergym-board.json`), not invented sample data.
- **Don't invent what the source doesn't have.** Absence is data, not a gap to paper over — this applies to any new feature, not just the import adapter.
- **Every real change goes through `no-mistakes`** (this repo's validation gate — review, test, lint, CI) before merging. Commits it authors are prefixed `no-mistakes(<step>):` — leave that convention alone.
- **Architecture decisions get an ADR** — see [docs/adr/](docs/adr/). Write one when choosing between two real options for a reason worth remembering.

## Config contract

This project's tool/workflow choices resolve through one system: `src/presets/catalog.ts` (the full preset catalog, 13 groups) + `src/presets/resolver.ts` (default → org → project → user resolution), loaded via `scripts/presets.mjs`'s `loadResolvedPresets(configPath)`. `nomothetes.config.example.json` shows the shape — copy it to `nomothetes.config.json` (gitignored) to override locally. There is no second, parallel config file; new bootstrap-relevant settings extend this catalog rather than inventing another mechanism.

Relevant to agents specifically: `agent.autonomyLevel` (`read-only` | `propose-only` | `write-with-review` | `autonomous`, default `write-with-review`) states what a coding agent is allowed to do unattended in a given project — check it before assuming push/merge authority.

## Agentic Modeling

Task-queued, skill-routed board editing lives in `mcp-server/` (`task-queue.mjs`, `sanitize-prompt.mjs`, `board-mutations.mjs`, `agentic-worker.mjs`) — see [ADR 0003](docs/adr/0003-agentic-modeling-write-path.md) for the write-target decision and `docs/solution-architecture.md`'s Agentic Modeling section for the full design. The MCP server (`mcp-server/index.mjs`) is the only write path to the board; the canvas's own Layer 2 edits stay in browser `localStorage` and are not reconciled with agent writes in v1. See also [docs/agentic-modeling-usage.md](docs/agentic-modeling-usage.md) for how to actually queue and run tasks day-to-day.

Working on this system specifically:

- **A task's prompts are literal strings**, not free text: `/skill-name {json-args}`, matching one of `place_element`, `edit_timeline`, `edit_example_map`, `run_wdyt`, `freeze_spec`. The worker (`agentic-worker.mjs`) is a deterministic dispatcher on that prefix, not an LLM — nothing in this codebase turns "add a login screen" into the right call. If you're building something that constructs those prompts, that translation is your job, not the worker's.
- **Every write tool re-reads the board file fresh before mutating, inside `board-store.mjs`'s `withBoardLock`** (`readBoard()`/`writeBoard()`), unlike the read-only tools in `index.mjs`, which load `board` once at module start and stay stale for the rest of that process's life. The lock is not optional decoration: a live 10-concurrent-worker test (ADR 0004's addendum) found that task-claim atomicity alone lets two workers processing *different* tasks silently clobber each other's writes to the *same* board file — 10 concurrent placements produced 7 nodes without the lock. Adding a new write tool: write the mutation as a pure function in `board-mutations.mjs` (takes a board object, mutates it in place, easy to unit test against an in-memory fixture — see `board-mutations.test.mjs`), then wire it into `index.mjs` following the existing `server.tool(name, description, zodShape, handler)` pattern, calling `readBoard()`/`writeBoard()` *inside* a `withBoardLock(path, () => {...})` callback, not around it unguarded.
- **Adding a new sanitization rule**: `sanitize-prompt.mjs`'s `RULES` array, each entry an array of regexes under a named category. Add adversarial fixtures to `sanitize-prompt.test.mjs` for it — this is the security-sensitive piece, don't ship a rule without a test proving it actually catches something.
- **Quick manual round-trip check**: `node mcp-server/smoke-test.mjs` drives the MCP server over real stdio JSON-RPC, including live write-tool calls against the actual board file — it restores the file to its prior state afterward, so it's safe to run against a real checkout.
- **Multi-board writes** (ADR 0004): `board-store.mjs`'s `boardPathFor(boardId)` resolves `src/data/<boardId>-board.json`; `null`/`undefined`/`"powergym"` all resolve to the original default path. Every write tool and the `task-queue.mjs add` CLI (`--board <id>`) accept an optional boardId.

## Interview harness (brief → board)

The upstream translation the bullet above says isn't the worker's job — turning a project/programme brief into the sequence of `/skill-name {json}` calls the worker applies — lives in `.claude/skills/eventmodeling-interview/SKILL.md`, not in code. It's a portable protocol (BYOH, see [ADR 0004](docs/adr/0004-interview-harness.md)): any coding agent that can read this repo and run shell commands can drive it; nothing in this repo calls an LLM to run the interview itself.

- `mcp-server/facilitator-roles.mjs` — the Socratic Interviewer / Ontologist / Contrarian / Simplifier pass sequence the skill runs, as data.
- `mcp-server/ambiguity-score.mjs` — the mechanical stop-condition (four Ouroboros-derived dimensions scored from real board state, never an LLM self-report). Run it directly: `node mcp-server/ambiguity-score.mjs <specId> [boardId]`.
- `board-mutations.mjs`'s `freezeSpec` — Ouroboros' immutable-seed-specs discipline, guards `placeElement` only (stated gap: doesn't guard `editTimeline`/`editExampleMap` yet).
- `mcp-server/interview-runner.mjs` — the actual thing the skill instructs a harness to drive: a declarative plan (ordered steps, `$ref` placeholders resolved from prior steps' results) runs as one command through the real queue/worker path. `node mcp-server/interview-runner.mjs run <plan.json>` — see `mcp-server/fixtures/interview-plans/` for real examples, not synthetic ones.
