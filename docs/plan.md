# Project Plan — Nomothetes Engine

## Background

**Updated 2026-10-04**: this project started as a personal MVP proving out a platform-pitch concept (bridging visual requirement gathering and agentic code generation) originally scoped as an internal pitch at a prior employer. That internal-pitch path is no longer relevant — the project is now Powerworks-Global's own open-core product, Nomothetes, with its own independent go-to-market. The history below is kept as an accurate record of how the engine was actually built, not rewritten away.

This repo is the open-core engine half of Nomothetes — a CRUD-native scenario-based development / behaviour-mapping canvas bridging visual requirement gathering and a bring-your-own-harness agentic generation path. Inspired by Event Modeling's discovery technique, not an implementation of it — see the README's Acknowledgments section. A separate private repo holds the Nomothetes-branded commercial layer on top (billing/digest exporters, compliance tooling).

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

`scripts/export-specifications.mjs` turns a slice's Layer 2 Example Map into a `specifications[]` array — the shape the downstream harness's own `build-state-change`/`build-state-view` Claude Code skills already consume to write one xUnit test per specification, reusing that agent-driven pipeline instead of building a new deterministic GWT-to-xUnit codegen engine. Contract defined and exporter working (hard refusal on unresolved Questions, prose-string `given`/`when`/`then` — a known deviation from real slice.json's symbolic event/command arrays, documented in the script's header).

**Traceability follow-up (done, 2026-10-05):** surfaced by a real external project (Rütli, a HackApertus submission) hitting the exact gap this phase's "not yet done" list implies — a specification had no way to point back at the requirement that drove it, or forward at what implements/verifies it. Closed in three pieces: `import-eventmodelers.mjs`'s seeded Example nodes now carry a structured `requirementRef: { acId, frId }` (previously only recoverable, fragilely, by parsing it back out of a generated node-id string); `export-specifications.mjs` carries that through unchanged and always emits `implementationRef`/`verificationStatus` (both `null` until annotated — this script only knows about the board, never about code or test runs); and a new `scripts/annotate-specifications.mjs` merges real evidence (which module satisfies a spec, whether its generated test currently passes) onto a `specifications.json` by spec id, with a hard refusal on an unmatched id or an invalid `verificationStatus.state`. Still not done: anything automated writes the annotations file — today a human or a CI step authors it by hand after a test run; wiring a CI job to generate it from real test-runner output is future work, same as the "mechanical build gate" item below.

Not yet done: wiring into the downstream harness's mechanical build gate, proving a spec change blocks a previously-passing build, and drift detection (this last one folds into Phase 6 above).

### Phase 8 — Skeptic role + board storage correction (2026-10-06)

Both found the same way: running the Interview harness for real against an external brief (a FHIR integration suite, unrelated to this engine) for the first time since PowerGym.

- **Skeptic, a fifth facilitator role** (`mcp-server/facilitator-roles.mjs`, see [ADR 0004](adr/0004-interview-harness.md)'s addendum) — catches a brief phrase that names an outcome with no stated mechanism, or a trust boundary between two systems the brief never addresses. Neither of the original four Ouroboros-derived roles catches this class; Contrarian stress-tests the placed *structure*, this stress-tests the brief's own *wording*.
- **Board storage correction** (see [ADR 0005](adr/0005-board-storage-lives-outside-this-repo.md)) — real usage immediately exposed that every board, including the one from this run, was landing inside `src/data/` of this engine's own repo. This repo now stores no board data at all: no bundled JSON, no implicit default directory. `boardPathFor()` requires both a real `boardId` and `NOMOTHETES_BOARD_DIR` pointed at wherever the board actually lives (the target project's own repo, per the real workflow: a facilitator logs in, adds a board, and that creates/targets an external git repo — the identity/repo-creation mechanism itself is named as real future work in ADR 0005, not built yet). All four previously-bundled demo boards deleted; the MCP server's read tools gained a required `boardId` they didn't have before (a breaking API change, deliberate).
- **Identity/ownership privacy constraint** (see [ADR 0006](adr/0006-identity-and-board-ownership-are-delegated-to-the-customers-own-git-host.md)) — a direct follow-up question to ADR 0005: for any paid tier, a customer needs Nomothetes's own maintainers unable to see their board's content unless explicitly added as a collaborator. Decided: identity and board ownership are both delegated entirely to the customer's own git host (OAuth, repo creation on their account, access control enforced by the git host, not a Nomothetes-built table). **Correction, same day, see [ADR 0007](adr/0007-byok-customer-held-keys-for-board-data-at-rest.md)**: a deliberate research pass before building anything against this found it overclaims — delegated git identity gives credential custody and revocability, not technical content confidentiality from staff during active use (same tier as GitHub's own private-repo access policy, proven by a real 2024 Vercel incident). ADR 0007 adds the actual content-confidentiality layer (BYOK, Google Workspace CSE-shaped) on top. Neither is implemented — no OAuth, repo-creation, or key-wrapping flow exists anywhere in this codebase yet.
- **BYOK content confidentiality** (see [ADR 0007](adr/0007-byok-customer-held-keys-for-board-data-at-rest.md)) — the customer runs or designates their own key-wrapping service; Powerworks stores only a wrapped per-board key, never the unwrapped key, at rest. Honest, named tradeoff: the Skeptic/facilitator AI passes still hold decrypted plaintext in memory *during active use* — this protects data at rest and in backups, and gives the customer an instant kill-switch via key revocation, but is not a zero-knowledge guarantee and must never be sold as one. Zero-knowledge was ruled out structurally (the AI-facilitator feature needs server-side plaintext access to function); confidential computing (Apple Private Cloud Compute's pattern) is named as the stronger future answer if a buyer ever requires excluding even transient plaintext access, but is too heavy a build for this project's current stage.
- **Telemetry data-minimization** (see [ADR 0008](adr/0008-telemetry-is-usage-statistics-only-never-board-content.md)) — closes the specific gap ADR 0007 named but didn't solve: a log line, trace span, or metric could leak board content even with BYOK protecting data at rest. Decided: traffic encrypted in transit, data at rest encrypted (ADR 0007), and the observability pipeline (Alloy → an LGTM stack, reusing AgentOS's own WS4.4 stack choice) carries usage statistics only — counts, durations, outcomes — never board content, enforced by never constructing a telemetry call from a board object in the first place rather than redacting one after the fact. Nothing emits telemetry yet; `agentic-modeling/progress.txt` already satisfies this discipline by construction and is the closest existing analog.

## Explicitly out of scope for this repo

- Regulated Industry mode / `compliance.md` enforcement — brief-level concern, not relevant until this becomes a real multi-project tool
- Dynamic architectural presets (CRUD / Event-Based / Full Event-Sourced) — this spike is CRUD-preset only
- Execution pathways (Human Handoff, Smart Ralph, Pluggable Agentic Orchestration) — this repo only builds the canvas half, not the execution routing
- Voice-assisted drafting — deferred per the brief, scoped as an Interview-agent capability, not raw voice input, when it does get built

## Status tracking

Day-to-day status lives in the Obsidian vault at `Active_Projects/Storyboard Canvas (Personal MVP)/`, not duplicated here — this file is the structural plan, that note is the living log.
