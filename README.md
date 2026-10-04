# Nomothetes Engine

**Nomothetes** (νομοθέτης, "lawgiver") is a visual canvas for **scenario-based development / behaviour mapping** — a way of designing a system by mapping out what users do and how the system responds, scenario by scenario, before (or while) you build it, rather than starting from a data model or a UI mockup.

The core idea: draw a timeline of what a user does and what the system does in response, as a sequence of steps across a few fixed lanes —

- **Actor** — who's doing something (a user, a scheduled job, another system)
- **Screen** — what they're looking at
- **Action** — the thing they trigger
- **Outcome** — the record/result that follows
- **Owned Data** — what each screen actually needs to show, traced back to the outcome that produced it

Laid out left to right as a timeline, this surfaces real design gaps early — a screen that needs data nothing upstream ever produces, or a step with no clear trigger — before any code gets written. Each step ("slice") can then carry its own **Rule** (a business rule in plain language), **Example** (a concrete Given/When/Then scenario), and **Question** (an open thing that still needs deciding, tracked as open/answered rather than lost in a chat thread) — turning the board from a diagram into something that can drive real test generation and agent-assisted building.

**This is not Event Modeling** — it's inspired by Event Modeling's timeline-based discovery technique, but deliberately drops event-sourcing vocabulary (Event, Command, Aggregate) in favor of plain, CRUD-friendly terms. That's a real design choice, not an oversight: the discovery power of laying out a timeline holds regardless of whether the team underneath is event-sourced, and the vocabulary swap removes a real translation cost for teams building conventional CRUD applications. See [Acknowledgments](#acknowledgments) for where the inspiration comes from.

This repo is the open-core engine: the canvas, the board data model, and a bring-your-own-harness ("BYOH") way to generate or edit a board with a coding agent. Owned by [Powerworks-Global](https://github.com/Powerworks-Global) — a separate private repo holds the Nomothetes-branded commercial layer (billing/stakeholder-digest exporters, compliance tooling) on top of what's here; see [CONTRIBUTING.md](CONTRIBUTING.md).

This is exploratory, pre-production tooling — see [Scope](#scope) below for exactly what's in and out right now.

## Quickstart

```bash
npm install
npm run dev
```

Opens the canvas with a real demo board already loaded — 18 story-arcs from a gym-management system's actual event model (149 nodes, 84 edges) — so you can explore a non-trivial board immediately, with nothing else to set up. Use the **Story-arc** selector in the sidebar to browse all 18, or double-click any slice to open its Example Map (the Rule/Example/Question layer).

To start a board of your own rather than exploring the demo one, see [docs/plan.md](docs/plan.md) for the current state of board creation, or use the [Interview harness](#whats-in-the-repo) to generate a first draft from a written brief via a coding agent.

## What's in the repo

| Path | What it is |
|---|---|
| `src/` | The canvas itself — React Flow app, lane layout, node/edge components |
| `mcp-server/` | An [MCP server](mcp-server/README.md) (13 tools, read + write) exposing the board to any MCP-compatible harness (Claude Code, Gemini CLI, etc.) |
| `mcp-server/interview-runner.mjs` | Runs a brief-to-board Interview plan end to end through the task queue/worker path — see the [Interview skill](.claude/skills/eventmodeling-interview/SKILL.md) and [ADR 0004](docs/adr/0004-interview-harness.md) |
| `scripts/export-specifications.mjs` | Turns a slice's Example Map into a `specifications[]` array for downstream test generation (one test per specification) |
| `scripts/import-eventmodelers.mjs` | Optional import path from a board already modeled in a compatible external tool's export format — see [Acknowledgments](#acknowledgments) below. Not required to use this project |
| `docs/` | Plan, solution architecture, and [ADRs](docs/adr/) for the real decisions made building this |

## Scope

**In (built):**
- Layer 1 board: Actor/Screen/Action/Outcome nodes, "produces"/"triggers" edges, fixed swimlane layout with drag-snap-to-lane
- Inline Scenario (Given/When/Then) attachment on any node
- Layer 2 Example Mapping: per-slice Rule/Example/Question cards, reached via the sidebar "Slices" list or double-clicking a slice's node (both show a live Rule/Example/Question count badge). Question cards carry a status (open/answered, with answer text and a timestamp)
- Import adapter from a compatible external export format; export adapter from an Example Map to a `specifications[]` array for test generation
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

## Acknowledgments

This project wouldn't exist without the people who built the ideas and tooling it stands on.

**Adam Dymitruk** created **Event Modeling** — see [eventmodeling.org](https://www.eventmodeling.org) for the primary reference. This canvas is not Event Modeling (it deliberately drops the event-sourcing vocabulary, see above), but it's a direct descendant of its central insight — that laying out a timeline of what happens, step by step, surfaces real design gaps before code gets written. Without that insight, there's no timeline to draw in the first place.

**Martin Dilger** (Nebulit GmbH) built [eventmodelers.ai](https://eventmodelers.ai), a commercial Event Modeling product, and the subsequent tooling around it that this project learned from and is compatible with — `scripts/import-eventmodelers.mjs` optionally reads a board exported from it, for anyone who already has one modeled there. That compatibility option exists because his tooling proved out real export formats and real board patterns worth supporting; the demo board included in this repo doesn't require it, but the path wouldn't be there without his work.

Neither Adam Dymitruk nor Martin Dilger is affiliated with this project — this acknowledgment is a credit, not a claim of endorsement or partnership.

## Related documentation

- [docs/plan.md](docs/plan.md) — project background, scope, and roadmap
- [docs/solution-architecture.md](docs/solution-architecture.md) — how the pieces fit together and why
- [docs/adr/](docs/adr/) — the decision log
- [mcp-server/README.md](mcp-server/README.md) — MCP server tools and how to register it with a harness
