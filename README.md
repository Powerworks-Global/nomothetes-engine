# storyboard-canvas-spike

A CRUD-native event-modeling canvas: [React Flow](https://reactflow.dev)-based Actor/Screen/Action/Outcome/Owned-Data swimlanes, with drag-snap-to-lane node placement and inline Given/When/Then Scenario attachment per node. Personal MVP proving out the design described in [the Version1 App Delivery Canvas brief](docs/plan.md#background) before it's pitched internally.

This is exploratory personal-project tooling, not production code — see [Scope](#scope) below for exactly what's in and out right now.

## Quickstart

```bash
npm install
npm run dev
```

Opens the canvas with PowerGym's real "Member Registration" story-arc loaded by default. Use the **Story-arc** selector in the sidebar to browse any of the 18 story-arcs imported from PowerGym's real eventmodelers.ai board.

## What's in the repo

| Path | What it is |
|---|---|
| `src/` | The canvas itself — React Flow app, lane layout, node/edge components |
| `scripts/import-eventmodelers.mjs` | Import adapter: parses eventmodelers.ai board exports (`requirements.md`/`research.md`, as transcribed by the PowerGym-style build kit) into this canvas's node/edge schema, plus a seed Layer 2 Example Map per slice where the source's Functional Requirements/Acceptance Criteria have real Rule/Example content to pull in |
| `scripts/export-specifications.mjs` | Export adapter (the reverse of the import script): turns one slice's Layer 2 Example Map into a `specifications[]` array, the shape a downstream test-generation harness's skills consume to write one xUnit test per specification — see the script's header comment for known schema deviations |
| `mcp-server/interview-runner.mjs` | Runs a brief-to-board Interview plan (declarative steps, auto-resolved `$ref`s between them) as one command through the real task queue/worker path — see [.claude/skills/eventmodeling-interview/](.claude/skills/eventmodeling-interview/SKILL.md) and [ADR 0004](docs/adr/0004-interview-harness.md) |
| `src/data/powergym-board.json` | The adapter's output, run against all 18 of PowerGym's real story-arcs — 149 nodes, 84 edges, plus 65 slices with a seeded Layer 2 Example Map |
| `mcp-server/` | An [MCP server](mcp-server/README.md) exposing the board to any MCP-compatible harness (Claude Code, Gemini CLI, etc.) — read-only for now |
| `docs/` | Plan, solution architecture, and [ADRs](docs/adr/) for the real decisions made building this |

## Scope

**In (v1, built):**
- Layer 1 board: Actor, Screen, Action, Outcome node types; "produces"/"triggers" edges
- Fixed swimlane layout with drag-snap-to-lane
- Inline Scenario (Given/When/Then) attachment on any node
- Import adapter for eventmodelers.ai board exports
- Read-only MCP server exposing the board
- Layer 2 Example Mapping: per-slice, free-form canvas of Rule/Example/Question cards, persisted to `localStorage`, with an "Export Board JSON" action for feeding the export adapters below; reached from the Layer 1 canvas via the sidebar "Slices" list or by double-clicking a slice's node, both showing a Rule/Example/Question count badge (see [the plan](docs/plan.md#phase-5--layer-2-example-mapping-done)). A slice opened for the first time pre-populates from the import adapter's seed data (real Rule/Example content, where the source had it) instead of starting blank; a slice with any saved board already — including one a user deliberately emptied — is never re-seeded
- Question nodes carry a status (open/answered, with answer text and an ISO timestamp) and a "Mark Answered" toolbar action; missing status is treated as open, so no migration is needed for boards saved before this field existed
- Export adapter turning a slice's Example Map into a `specifications[]` array for downstream test-generation (`scripts/export-specifications.mjs`) — see [the plan](docs/plan.md) for what's still out of scope (wiring into a mechanical gate, drift detection)
- Interview harness: a brief-to-board generator (facilitator roles, mechanical ambiguity gate, `interview-runner.mjs` orchestration) — see [ADR 0004](docs/adr/0004-interview-harness.md)

**Out (deferred):**
- Markdown export beyond the exporters and MCP tool responses above
- AI-generated content (sketches, code)
- Multiplayer/collaboration
- Real-time push notifications and two-way/live stakeholder editing — digests are shared manually and answers are still entered back via "Mark Answered", not captured automatically
- Writing back to the board (the planned "Agentic Modeling" capability — task-queued, skill-routed edits; see [the plan](docs/plan.md))

## Development

Built with Vite + React + TypeScript + `@xyflow/react`. Standard Vite scripts apply: `npm run dev`, `npm run build`, `npm run lint`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the working conventions this repo follows.

## Related documentation

- [docs/plan.md](docs/plan.md) — project background, scope, and roadmap
- [docs/solution-architecture.md](docs/solution-architecture.md) — how the pieces fit together and why
- [docs/adr/](docs/adr/) — the decision log
- [mcp-server/README.md](mcp-server/README.md) — MCP server tools and how to register it with a harness
