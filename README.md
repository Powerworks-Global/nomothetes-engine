# Nomothetes Engine

The open-core engine behind **Nomothetes** (νομοθέτης, "lawgiver") — a CRUD-native event-modeling canvas: [React Flow](https://reactflow.dev)-based Actor/Screen/Action/Outcome/Owned-Data swimlanes, with drag-snap-to-lane node placement and inline Given/When/Then Scenario attachment per node, plus a bring-your-own-harness ("BYOH") Interview protocol for generating a board from a brief.

Owned by [Powerworks-Global](https://github.com/Powerworks-Global). This repo is the open-core generic engine half — a separate private repo holds the Nomothetes-branded commercial layer (billing/stakeholder-digest exporters, compliance tooling) on top of what's here. See [CONTRIBUTING.md](CONTRIBUTING.md) for that split.

This is exploratory, pre-production tooling — see [Scope](#scope) below for exactly what's in and out right now.

## Quickstart

```bash
npm install
npm run dev
```

Opens the canvas pre-loaded with a real, non-trivial demo board: 18 story-arcs imported from **PowerGym**, a third-party gym-management system's actual event-modeling board (via its eventmodelers.ai export) — used because it's real, messy, non-trivial source data, not a toy example built to look clean. Use the **Story-arc** selector in the sidebar to browse all 18.

## What's in the repo

| Path | What it is |
|---|---|
| `src/` | The canvas itself — React Flow app, lane layout, node/edge components |
| `scripts/import-eventmodelers.mjs` | Import adapter: parses eventmodelers.ai board exports into this canvas's node/edge schema, plus a seed Layer 2 Example Map per slice where the source has real Rule/Example content |
| `scripts/export-specifications.mjs` | Export adapter: turns a slice's Layer 2 Example Map into a `specifications[]` array for downstream test generation (one test per specification) |
| `mcp-server/` | An [MCP server](mcp-server/README.md) (13 tools, read + write) exposing the board to any MCP-compatible harness (Claude Code, Gemini CLI, etc.) |
| `mcp-server/interview-runner.mjs` | Runs a brief-to-board Interview plan end to end through the task queue/worker path — see the [Interview skill](.claude/skills/eventmodeling-interview/SKILL.md) and [ADR 0004](docs/adr/0004-interview-harness.md) |
| `src/data/powergym-board.json` | The import adapter's output: PowerGym's 18 story-arcs as 149 nodes, 84 edges, 65 slices with seeded Example Maps |
| `docs/` | Plan, solution architecture, and [ADRs](docs/adr/) for the real decisions made building this |

## Scope

**In (built):**
- Layer 1 board: Actor/Screen/Action/Outcome nodes, "produces"/"triggers" edges, fixed swimlane layout with drag-snap-to-lane
- Inline Scenario (Given/When/Then) attachment on any node
- Layer 2 Example Mapping: per-slice Rule/Example/Question cards, reached via the sidebar "Slices" list or double-clicking a slice's node (both show a live Rule/Example/Question count badge). A slice pre-populates from the import adapter's seed data on first open; a slice someone has already edited — including one deliberately emptied — is never re-seeded. Question cards carry a status (open/answered, with answer text and a timestamp)
- Import adapter for eventmodelers.ai board exports; export adapter from an Example Map to a `specifications[]` array for test generation
- **MCP server, read + write**: read tools (list/search/export the board) and a write path — `place_element`, `edit_timeline`, `edit_example_map`, `run_wdyt` (analysis-only, never mutates) — queued and processed by a worker, not called directly by just any client. See [ADR 0003](docs/adr/0003-agentic-modeling-write-path.md) for the write-target design
- **Interview harness (BYOH)**: a brief-to-board generator — facilitator roles (Socratic Interviewer/Ontologist/Contrarian/Simplifier), a mechanical ambiguity gate, orchestrated end to end by `interview-runner.mjs`. No bundled LLM runtime; you bring your own coding agent — see [ADR 0004](docs/adr/0004-interview-harness.md)

**Out (deferred):**
- Markdown export beyond the exporters and MCP tool responses above
- AI-generated content (sketches, code)
- Multiplayer/collaboration
- Real-time reconciliation between agent writes and live browser `localStorage` state — the write path above exists, but a human still re-opens the board to see an agent's change, it doesn't push live
- Real-time push notifications and two-way/live stakeholder editing — digests are shared manually and answers are entered back via "Mark Answered", not captured automatically

## Development

Built with Vite + React + TypeScript + `@xyflow/react`. Standard Vite scripts apply: `npm run dev`, `npm run build`, `npm run lint`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the working conventions this repo follows.

## Related documentation

- [docs/plan.md](docs/plan.md) — project background, scope, and roadmap
- [docs/solution-architecture.md](docs/solution-architecture.md) — how the pieces fit together and why
- [docs/adr/](docs/adr/) — the decision log
- [mcp-server/README.md](mcp-server/README.md) — MCP server tools and how to register it with a harness
