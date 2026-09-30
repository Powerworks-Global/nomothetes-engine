# Project Plan — Storyboard Canvas

## Background

This is the personal MVP for the **V1 App Delivery Canvas** — a Version1 internal pitch proposing a unified platform bridging visual requirement gathering and agentic code generation. The brief needs a working demo before it goes in front of leadership; this repo is that demo, built independently first. (The brief itself lives outside this repo, in the author's private notes — not linked here since it's not part of this codebase.)

The core idea: Event Modeling's timeline is what does the real discovery work (exposing ordering gaps, screens reading data nothing produces) — the event-sourcing vocabulary (Event, Command, Aggregate) is a separate, removable problem that creates real translation cost for teams building conventional CRUD applications. This canvas keeps the timeline's discovery power, drops the vocabulary.

## Goal

Prove the Layer 1 board (Actor/Screen/Action/Outcome/Owned-Data swimlanes) works against real, non-trivial content — not toy data — before investing in the fuller platform (Layer 2 Example Mapping, compliance.md-driven regulated mode, pluggable execution pathways) described in the brief.

## Phases

### Phase 0 — Swimlane spike (done)

Fixed-lane React Flow layout, drag-snap-to-lane, inline Scenario attachment. Validated against PowerGym's real "Member Registration" story-arc, hand-transcribed from its actual eventmodelers.ai board export.

### Phase 1 — Import adapter (done)

`scripts/import-eventmodelers.mjs` parses the real board-export markdown format (`requirements.md`'s Event Model Detail section, `research.md`'s UI Reference section) into the canvas's schema. Run against all 18 of PowerGym's real story-arcs: 149 nodes, 84 edges, 0 self-loops. Also seeds a Layer 2 Example Map per slice (65 of them) from `requirements.md`'s Functional Requirements/Acceptance Criteria, where present — see Phase 5.

### Phase 2 — Canvas UI wiring (done)

Story-arc selector in the app UI, loading any imported arc on demand with computed timeline-column layout (the source board carries no position data — every element's coordinates are inferred from slice order, not read off the export).

### Phase 3 — MCP export (done)

`mcp-server/` exposes the board over the Model Context Protocol instead of a hand-built per-harness exporter — see [ADR 0002](adr/0002-mcp-export-over-per-harness-adapters.md). Read-only v1: `list_story_arcs`, `get_story_arc`, `search_elements`.

### Phase 4 — Agentic Modeling (write path done, pending merge)

Task-queued, skill-routed write path that edits the board itself — see [ADR 0003](adr/0003-agentic-modeling-write-path.md) for the write-target decision and `docs/solution-architecture.md`'s Agentic Modeling section for the full design. Delivered: directory-based task queue with atomic claim (porting AgentOS's `os.rename` pattern to Node's `fs.renameSync`, priority ordering per PowerGym's `agentic-modeling/CLAUDE.md`), prompt sanitization, four MCP write tools (`place_element`, `edit_timeline`, `edit_example_map`, `run_wdyt` — analysis-only, never mutates), and a worker entrypoint. Not yet done: `/update-slice-status` (the underlying "ready" status toggle doesn't exist in the codebase yet — separate scope), real-time reconciliation between agent writes and live browser `localStorage` state (explicitly deferred in ADR 0003), and a friendlier task-authoring surface — today a task is a literal `/skill-name {json}` string; something upstream (human or LLM) still has to produce that, the worker itself doesn't interpret free text. PRs [#18](https://github.com/Powerworks/storyboard-canvas-spike/pull/18)/[#19](https://github.com/Powerworks/storyboard-canvas-spike/pull/19), draft.

### Phase 5 — Layer 2 Example Mapping (done)

Per-slice drill-down (`ExampleMapView`), reached via a "Slices" list in the Layer 1 side panel or by double-clicking a slice's node on the Layer 1 canvas: Rule (yellow) / Example (green, reusing Layer 1's Given/When/Then scenario shape) / Question (red) cards, free-form React Flow canvas, persisted to `localStorage` per slice (`exampleMapStore.ts`). Examples and Questions must attach to an already-selected Rule, matching the real Example Mapping facilitation method. Both entry points show a per-slice Rule/Example/Question count badge (red if the slice has an open Question) so Layer 2 completeness is visible without opening the board. A slice opened for the first time pre-populates from the import adapter's board-derived seed data (Phase 1) instead of starting blank, where the source had real Rule/Example content; no Question cards are seeded — the source's Unresolved Questions section has no per-slice attribution in any real spec.

### Phase 6 (stretch) — Loopback / drift detection (not started)

Per the brief's resolved question on bi-directionality: v1 stays uni-directional (canvas → export → code, re-export on change). Drift detection (flag when built code and the last-exported spec have diverged, without auto-reconciling) is the real next step — full bi-directional sync only once that's proven reliable.

### Phase 7 — Spec-to-oracle export (in progress)

`scripts/export-specifications.mjs` turns a slice's Layer 2 Example Map into a `specifications[]` array — the shape the downstream harness's own `build-state-change`/`build-state-view` Claude Code skills already consume to write one xUnit test per specification, reusing that agent-driven pipeline instead of building a new deterministic GWT-to-xUnit codegen engine. Contract defined and exporter working (hard refusal on unresolved Questions, prose-string `given`/`when`/`then` — a known deviation from real slice.json's symbolic event/command arrays, documented in the script's header). Not yet done: wiring into the downstream harness's mechanical build gate, proving a spec change blocks a previously-passing build, and drift detection (this last one folds into Phase 6 above).

## Explicitly out of scope for this repo

- Regulated Industry mode / `compliance.md` enforcement — brief-level concern, not relevant until this becomes a real multi-project tool
- Dynamic architectural presets (CRUD / Event-Based / Full Event-Sourced) — this spike is CRUD-preset only
- Execution pathways (Human Handoff, Smart Ralph, Pluggable Agentic Orchestration) — this repo only builds the canvas half, not the execution routing
- Voice-assisted drafting — deferred per the brief, scoped as an Interview-agent capability, not raw voice input, when it does get built

## Status tracking

Day-to-day status lives in the Obsidian vault at `Active_Projects/Storyboard Canvas (Personal MVP)/`, not duplicated here — this file is the structural plan, that note is the living log.
