# Solution Architecture

A living description of the system as it exists today — see [docs/adr/](adr/) for why each of these decisions was made, this file just describes what's actually there.

## Overview

```
eventmodelers.ai board export (requirements.md + research.md)
            │
            ▼
scripts/import-eventmodelers.mjs  ──►  src/data/powergym-board.json  ◄──┐
            │                                      │                    │
            │                                      ├──► React app       │
            │                                      │    (localStorage   │
            │                                      │     for Layer 2)   │
            │                                      │                    │
            │                                      └──► MCP server ─────┘
            │                                           (read tools:        (write tools:
            │                                            loaded once)        place_element,
            │                                                                edit_timeline,
            └── run manually, output committed (not a build-time step)       edit_example_map)
```

One canonical data artifact (`src/data/powergym-board.json`), written by the import adapter and — as of Agentic Modeling (below) — the MCP server's write tools too. Two consumers read it (the React canvas, the MCP server's read tools); neither talks to the eventmodelers.ai export format directly. Alongside the Layer 1 `{nodes, edges}`, the artifact carries a per-slice `seedExampleMaps` map — the React canvas's own Layer 2 edits live in `localStorage` instead and are **not** reconciled with agent writes to `seedExampleMaps` (see Agentic Modeling's "what's deliberately not built yet" below).

## Components

### Import adapter (`scripts/import-eventmodelers.mjs`)

Parses the real board-export markdown format:
- `requirements.md`'s `## Event Model Detail (Source of Truth)` section — Slice blocks, each containing Command/Event/Automation elements with `Dependencies:` lines
- `requirements.md`'s `## Functional Requirements` table and each User Story's Acceptance Criteria bullets — joined 1:1 by AC-N.M reference id to seed a Layer 2 Rule+Example pair per slice, where present (see below)
- `research.md`'s `## UI Reference` section — Screen elements, associated with a slice by name (not uuid — a real gap the parser has to bridge, see below)

Key design points, each earned through a real bug found via review:
- **Elements resolved by `(label, laneId)`, not label alone** — a Screen and a Command/Automation can share an identical label in real PowerGym data (confirmed in 3 specs). Resolving by label alone lets one silently overwrite the other, producing a self-loop.
- **Edge labels derived from the referenced element's actual type** — `SCREEN` → `"triggers"`, everything else → `"produces"` — not a blanket label regardless of what's on the other end.
- **Action→Outcome edges are inferred, not read** — the source text never states "this Action produces this Event" explicitly; it's implied by both belonging to the same Slice block. The adapter makes that pairing explicit.
- **Screen sliceId resolved from name to uuid** — `research.md` only names a Screen's slice by its string name (`_(from slice: Register Member)_`), while every other element uses the slice's uuid. The adapter cross-references the two so a Screen lands in the correct timeline column.
- **Seed Example Map join keyed on the produced event's label, not the AC's "When `<label>`" text** — command/automation labels can collide across sibling slices in the same spec (confirmed: two AUTOMATION slices both named "Shift Guard" in one real spec), which would silently misattribute a seed to the wrong slice; a produced-event label is confirmed unique per spec across all 18 real specs, so it's the primary join key, with the "When" text as fallback only when no event match exists.

Output: a flat `{nodes, edges}` JSON structure, not positioned — layout is a downstream concern — plus a `seedExampleMaps` map of sliceId to a seed Layer 2 board, populated only for slices where a Functional Requirement/Acceptance Criteria pair could be resolved.

### Canvas (`src/`)

- `lanes.ts` — the five fixed swimlanes (Actor/Screen/Action/Outcome/Owned-Data) as Y-bands, plus `snapYToLane` for drag-and-drop.
- `LaneBackground.tsx` — renders the lane bands behind the React Flow canvas. Not a React Flow primitive — plain absolutely-positioned divs.
- `StoryboardNode.tsx` — the custom node component, styled by lane, showing an attached Scenario (Given/When/Then) as a badge + detail panel if present.
- `loadBoard.ts` — transforms the import adapter's flat node/edge JSON into React Flow's `Node[]`/`Edge[]` shape, computing timeline-column X positions per spec (slices in order of first appearance) and snapping Y to each node's lane. Also exposes `listSlices`, enumerating a spec's slices labeled by their Screen node when present (the source board carries no separate slice title field).
- `App.tsx` — ties it together: a story-arc selector, the React Flow canvas, the Scenario side panel, and a "Slices" list that opens each slice's Layer 2 Example Map.
- `ExampleMapView.tsx` / `ExampleMapNode.tsx` / `exampleMapStore.ts` — Layer 2 Example Mapping: a free-form, per-slice React Flow canvas of Rule (yellow) / Example (green, reusing the Scenario Given/When/Then shape) / Question (red, or grey with inline answer text once marked answered via the "Mark Answered" toolbar action) cards. Examples and Questions must attach to a selected Rule. Persisted to `localStorage` per slice. A slice opened for the first time pre-populates from the import adapter's `seedExampleMaps` entry (real Rule/Example content), if one exists, rather than starting blank; `exampleMapStore.ts`'s `hasExampleMap` (raw `localStorage` presence, not "zero nodes") distinguishes that never-touched case from a slice a user deliberately emptied, which is never re-seeded.

### MCP server (`mcp-server/`)

A protocol wrapper over `src/data/powergym-board.json` — see [ADR 0002](adr/0002-mcp-export-over-per-harness-adapters.md) for why this exists instead of per-harness exporters. Eight read-only tools (`list_story_arcs`, `get_story_arc`, `search_elements`, `list_slices`, `get_example_map`, `export_specifications`, `get_slice_rules`, `get_slice_examples`) load the board **once** at module start — fine for reads, but stale for anything that writes, which is why the four write tools below don't share that loading path. No independent state beyond the file itself.

### Agentic Modeling (`mcp-server/`, `agentic-modeling/`)

See [ADR 0003](adr/0003-agentic-modeling-write-path.md) for the write-target decision. This is the write path the section above doesn't have: an async, task-queued way to mutate the board, built by porting two existing real systems rather than inventing a third — AgentOS's Python task queue (atomic claim via `os.rename`) and PowerGym's `agentic-modeling/CLAUDE.md` (priority ordering, prompt sanitization, skill routing, an append-only progress log).

**Task queue** (`mcp-server/task-queue.mjs`): a directory-based state machine, `agentic-modeling/inbox/{pending,processing,done,failed}/`, one task per JSON file. Claiming a task is a `fs.renameSync` from `pending/` to `processing/` — the same POSIX rename atomicity AgentOS relies on, so two concurrent claimants can't both win the same task. Ordering: `priority: true` tasks first, then earliest `createdAt` — PowerGym's convention, since AgentOS's own queue is FIFO-only.

**Sanitization** (`mcp-server/sanitize-prompt.mjs`): every prompt in a task is checked before it can reach a write tool. Four rule categories, each dropping the prompt outright: shell-command injection (`$(...)`, backticks, `rm`/`curl`/`sudo`-style invocations), reaching outside the project (`../`, `/etc/`, `/home/`, credential-looking env references), off-topic content, and instruction-override attempts ("ignore previous instructions," persona-hijack phrasing). Dropped prompts are recorded with which rule caught them, not silently discarded.

**Write tools** (registered in `mcp-server/index.mjs` alongside the read-only ones, logic in `mcp-server/board-mutations.mjs` + `mcp-server/board-store.mjs`): `place_element` (add an Actor/Screen/Action/Outcome/ownedData node, optionally edged from an existing one), `edit_timeline` (add/rename/reorder Action/Outcome nodes), `edit_example_map` (add/edit Rule/Example/Question cards on a slice's `seedExampleMaps` entry — the only write target for Layer 2, since the MCP server has no access to the browser's `localStorage`), and `run_wdyt` (analysis-only data-continuity check — flags Examples missing a Rule link, incomplete Given/When/Then scenarios, unresolved Questions; **never mutates**, verified by hash comparison in both its unit tests and a live smoke test). Unlike the read-only tools, each write tool calls `board-store.mjs`'s `readBoard()` immediately before mutating and `writeBoard()` immediately after — a fresh read-mutate-write cycle per call, not the stale module-load snapshot.

**Worker** (`mcp-server/agentic-worker.mjs`): claims and processes exactly one task per invocation — meant to be run repeatedly by a scheduler, not to loop internally (mirrors AgentOS's `worker.py`). A task's prompts must already be in `/skill-name {json-args}` form; the worker is a deterministic dispatcher matching that prefix to one of the four write-tool functions above, **not an LLM** — it doesn't interpret free text like "add a login screen" into the right call itself. That translation is expected to happen upstream, by whatever enqueues the task (a human, or an LLM-driven caller — PowerGym's own real-world version of this pattern uses an actual coding agent for exactly that step). Each processed task gets one append-only entry in `agentic-modeling/progress.txt` (`## [timestamp] — Task [id]`, per-prompt outcome, applied/failed count), and moves to `done/` if at least one prompt applied, `failed/` otherwise.

## What's deliberately not built yet

- Real-time reconciliation between agent writes (to the committed JSON) and live browser `localStorage` state for Layer 2 — explicitly out of scope for Agentic Modeling v1 (ADR 0003); a human's unsaved in-browser edits and an agent's `seedExampleMaps` write can diverge with nothing to detect it yet.
- A task-authoring surface friendlier than a literal `/skill-name {json}` string — see the worker note above.
- `/update-slice-status` — the underlying "ready" status toggle this would flip doesn't exist in the codebase yet.
- No persistence beyond the committed JSON file and Layer 2's per-slice `localStorage` — no database, no live sync with eventmodelers.ai itself.

See [docs/plan.md](plan.md) for the phased roadmap these gaps map onto.
