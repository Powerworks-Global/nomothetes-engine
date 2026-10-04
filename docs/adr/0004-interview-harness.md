# ADR 0004: The Interview harness is a portable protocol (BYOH), scored mechanically, not a bundled agent

**Status:** Accepted, 2026-09-30

## Context

Agentic Modeling (ADR 0003) built the write *path* — task-queued, sanitized, skill-routed mutations to the board — but deliberately left the translation from a brief into those calls as someone else's job. `AGENTS.md` and `docs/solution-architecture.md` both state this plainly: the worker is "a deterministic dispatcher... **not an LLM**... nothing in this codebase turns 'add a login screen' into the right call."

Two real reference systems inform what should fill that gap:

- **PowerGym's own `agentic-modeling/` flow** — the same skill-routed pattern (`/timeline`, `/place-element`, `/wdyt`) Agentic Modeling already ported, run by a real coding agent upstream of the worker in PowerGym's own production use.
- **Ouroboros** (github.com/Q00/ouroboros) — Interview → Seed → Execute → Evaluate → Evolve, gated by a *quantified* ambiguity score rather than a binary check, with immutable seed specs once frozen.

The shape decided here: this project ships the MCP/CLI tool contract and a portable Interview protocol; the operator's own harness (Claude Code, Pi, Antigravity, whatever) drives it — bring-your-own-harness (BYOH), not a bundled agent. That decision follows from a documented, real MCP-write bug class in a comparable tool (first-match lane targeting, stale cell refs, delete-vs-unassign conflation) that a bundled agent would inherit as liability, and from a general preference for a narrow, validated tool contract over owning an agent loop's own judgment calls.

## Decision

1. **The Interview is a Skill (`.claude/skills/eventmodeling-interview/SKILL.md`), not code.** It's a set of instructions for whatever harness reads it — nothing in this repo calls an LLM API. This is the literal BYOH mechanism: the skill is portable to any harness that can read a repo and run shell commands.
2. **Facilitator roles are data** (`mcp-server/facilitator-roles.mjs`), matching `src/presets/catalog.ts`'s own declarative pattern, not prompts hardcoded into a runtime. Socratic Interviewer → Ontologist → Contrarian → Simplifier, ported from Ouroboros' "specialized agent perspectives."
3. **The ambiguity gate is mechanical** (`mcp-server/ambiguity-score.mjs`), scored from real board state — never an LLM's self-report of its own output. Four dimensions (goalClarity, constraints, successCriteria, context), the same "never just a boolean" discipline as `run_wdyt`, gated additionally by a hard zero-unresolved-Questions requirement matching `export-specifications.mjs`'s existing refusal policy.
4. **`freeze_spec` is a fifth write skill** (`board-mutations.mjs`, registered in `agentic-worker.mjs`'s `SKILLS` map and `index.mjs`'s MCP tools), implementing Ouroboros' immutable-seed-specs discipline. It guards `placeElement` only — stated scope, not silently assumed broader.
5. **`board-store.mjs`/`task-queue.mjs` generalized for multi-board writes.** The Interview needs to seed a *brand-new* board, not just edit PowerGym's — `readBoard`/`writeBoard` now resolve a path per `boardId` (defaulting to the original PowerGym path for backward compatibility), and the `task-queue.mjs add` CLI now accepts `--board <id>` (the `boardId` field on a task already existed; nothing before this exposed it at the CLI).

## Reasoning

Why mechanical scoring over an LLM self-assessing its own board: the whole codebase's existing discipline (a sibling project's own coverage/drift eval-harness checks, `export-specifications.mjs`'s hard refusal on unresolved Questions) is "never trust a self-report, verify against real state." An ambiguity score is exactly the kind of number an LLM could rationalize upward under pressure to finish; a score computed from actual node/edge/card counts can't be talked past.

Why a Skill and not a script that itself calls an LLM: a script would make this project the thing paying for and being liable for the interview's own judgment calls — precisely the position BYOH exists to avoid. A Skill is inert until a harness chooses to run it.

## Consequences

- The Simplifier facilitator pass can only *flag* duplicate/overlapping slices via `run_wdyt`-style findings — there's no merge/collapse mutation in `board-mutations.mjs` yet. Stated as a known gap in both the facilitator-roles data and the Skill itself, not silently worked around.
- `freeze_spec` guards `placeElement` only, not `editTimeline`/`editExampleMap` — freezing stops *new* generation onto a specId but doesn't yet lock already-placed nodes against later edits. A real, named gap for a future pass, matching this codebase's habit of stating scope honestly rather than overclaiming.
- The Interview loop has a stated 3-pass budget, not a guarantee of reaching `readyForHandoff` — an honest partial board with visible open Questions is a legitimate, expected outcome, not a failure mode to hide.
- This generalizes `board-store.mjs` beyond what ADR 0003 scoped (single PowerGym board) — a real, deliberate widening of that decision's boundary, documented here rather than silently expanding ADR 0003's own text.

## Addendum, 2026-09-30: closing three gaps before wider review

A structured review against three external standards (Team Topologies' cognitive-load framing, Abi Noda's DX-measurement discipline, Charity Majors' test-in-production/observability standard) found the first cut real but incomplete in three ways. Closed same day, same branch:

1. **Cognitive load (Skelton)** — the first live demo needed 8+ manual `task-queue.mjs`/`agentic-worker.mjs` invocations plus a throwaway `node -e` per step to shell back into the board JSON and find a just-placed node's id. None of that bookkeeping is intrinsic to the Interview process itself. **`mcp-server/interview-runner.mjs`** now runs a whole facilitator pass as one command from a declarative plan (`$ref` placeholders resolved automatically between steps), through the same real queue/worker path — not a bypass. `agentic-worker.mjs` was refactored (`processAndFinalize` extracted from `claimAndProcessOne`) so both the CLI worker and the runner share one real implementation, and `task-queue.mjs` gained `claimTask(id)` so the runner claims *its own* just-queued task deterministically rather than racing a shared "claim whatever's next."
2. **Evidence over vibes (Noda)** — the first demo used a brief written to succeed cleanly (score 1.0, first pass), which proves the mechanism but nothing about real friction. A second demo used a deliberately underspecified real brief ("board co-review before freeze") and reported honest metrics: 3 plan runs, ~24ms total mutation time, `combinedScore: 0.875` but `readyForHandoff: false` — 2 real unresolved Questions correctly hard-gating a score that would otherwise read as "ready." The mechanism refused to force a clean result on genuine ambiguity, which is the actual point of the gate, not a corner case to paper over.
3. **Test in production (Majors)** — a live 10-task, 10-concurrent-worker test found a **real bug**, not a hypothetical: task-claim atomicity (the atomic `rename` in `task-queue.mjs`) prevents two workers from double-processing the *same* task, but does nothing to stop two workers racing `readBoard`/`writeBoard` on the *same board file* while processing *different* tasks. 10 concurrent single-node placements produced a board with 7 nodes, not 10. Fixed with `board-store.mjs`'s `withBoardLock` (a cross-process `mkdirSync`-based lock, atomic on every platform Node supports, stale locks broken after 5s) wrapping every real read-modify-write cycle — both `processAndFinalize` and all four of `index.mjs`'s MCP write tools, which had the identical unguarded pattern via a separate call path. Re-ran the identical test after the fix: 10/10 nodes. Also added a live sanitizer-trip test (an override-attempt phrase live-rejected, board untouched) and a live failure-injection test (a dangling `afterNodeId` live-failed cleanly, no lock leaked, the next valid task processed normally immediately after) — `sessionId` (threaded through `task-queue.mjs`/`formatProgressEntry`) makes all of this greppable in a shared `progress.txt`.

Real finding worth naming plainly: **the concurrency bug would not have been caught by unit tests alone** — `board-mutations.test.mjs`'s in-memory fixtures and `task-queue.test.mjs`'s tmpdir isolation both test correct components in isolation; only running real concurrent OS processes against a real shared file exposed the interaction bug between them. This is the concrete argument for "test in production" as a discipline, not just a slogan borrowed for this addendum.

## Related

[ADR 0003](0003-agentic-modeling-write-path.md) (the write path this builds on); [ADR 0002](0002-mcp-export-over-per-harness-adapters.md) (the MCP-over-per-harness-adapter precedent BYOH extends to generation).
