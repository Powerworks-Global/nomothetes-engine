---
name: "eventmodeling-interview"
description: "Turn a project/programme brief into a populated EUnomia Layer 1 board (and seeded Layer 2 Example Maps) through a facilitated, ambiguity-gated interview — the brief-to-board harness. Bring-your-own-harness by design: this skill is the portable protocol, any coding agent that can read this repo and run shell commands can drive it."
argument-hint: "Path to a brief (text/markdown file), or the brief pasted inline"
compatibility: "Requires this repo checked out with mcp-server/ present; no MCP connection needed — this skill drives the same functions via the CLI entrypoints."
metadata:
  author: "Powerworks"
  adr: "docs/adr/0004-interview-harness.md"
user-invocable: true
disable-model-invocation: false
---

## What this is

The missing piece between "here's a brief" and "here's a fully fleshed-out board." Everything downstream of a populated board already exists and is deterministic — `place_element`/`edit_timeline`/`edit_example_map`/`run_wdyt`/`freeze_spec` are safe, sanitized, unit-tested write operations (`mcp-server/board-mutations.mjs`), dispatched by a worker that is explicitly **not an LLM** (`mcp-server/agentic-worker.mjs`'s own header comment). Nothing in this codebase turns a brief into the right sequence of those calls — that's this skill's job.

**Bring-your-own-harness**: this skill is a portable protocol, not a bundled agent. It doesn't call an LLM API itself — it's a set of instructions *for* whatever harness is running it (you, right now, reading this). See `docs/adr/0004-interview-harness.md` for why: EUnomia ships the tool contract and this protocol; the harness driving it is always the operator's own.

## Before you start

1. Confirm you're in this repo (`mcp-server/board-mutations.mjs` should exist).
2. Pick a `boardId` and `specId` for this brief. **A new brief gets a new boardId** (`src/data/<boardId>-board.json` — don't yet exist on disk, that's fine, `readBoard` returns an empty skeleton) unless the user explicitly says to extend an existing board. Ask if it's ambiguous; don't guess and silently overwrite someone's board.
3. Read `mcp-server/facilitator-roles.mjs` — the four roles and their sequence are data, read it rather than re-deriving it from this doc, so the two never drift.

## The loop

For up to **3 passes** (a stated budget, not unbounded — see "When to stop" below), run the full `FACILITATOR_SEQUENCE` in order, **writing each pass's operations as one JSON plan and running it in one command** via `mcp-server/interview-runner.mjs` — not by hand-composing individual `task-queue.mjs add` calls and shelling back into the board file to find a placed node's id. That manual choreography was the first real friction this harness hit (a live demo run needed 8+ discrete shell invocations plus a throwaway `node -e` per id lookup) — `interview-runner.mjs` exists specifically to remove it: give a step a `ref` name, reference it as `"$ref"` in a later step's args, and the runner resolves it for you.

A plan file's shape:

```json
{
  "boardId": "<boardId>",
  "sessionId": "<a label for this interview run, for grepping agentic-modeling/progress.txt later>",
  "specId": "<specId>",
  "steps": [
    { "ref": "actor", "skill": "place_element", "args": { "specId": "<specId>", "sliceId": "<slice-id>", "sliceType": "command", "laneId": "actor", "label": "..." } },
    { "ref": "action", "skill": "edit_timeline", "args": { "operation": "add", "specId": "<specId>", "sliceId": "<slice-id>", "sliceType": "command", "laneId": "action", "label": "...", "afterNodeId": "$actor" } }
  ]
}
```

Run it: `node mcp-server/interview-runner.mjs run <plan.json>` — prints a report (steps run, applied count, elapsed time per step and total, and the ambiguity score if `specId` was set) and exits non-zero if it halted early. **Slice ids you invent should be stable, readable strings** (e.g. `register-member`), not random — they're what later steps and the human reviewing the board will refer back to.

### 1. Socratic Interviewer (read-only pass, no plan file)

Read the brief. Extract only what it *actually states*: explicit actors, explicit goals, explicit constraints. Don't invent — this mirrors `scripts/import-eventmodelers.mjs`'s own "don't invent what the source doesn't have" discipline, just applied to a prose brief instead of an export file. Anything the brief implies but doesn't state goes on a running list of open questions, not into the board yet.

### 2. Ontologist (structural pass)

From what pass 1 extracted, write one plan step per Actor/Screen/Action/Outcome element and slice boundary (`place_element` for Actor/Screen, `edit_timeline` with `operation: "add"` for Action/Outcome), chaining `afterNodeId` via `$ref`. Run the plan.

### 3. Contrarian (failure-path pass)

For each slice the Ontologist pass placed, ask: what failure Outcome is implied but missing? (The same "every Outcome is a candidate failure mode" rule as [[Board Vocabulary → Operability Mapping]] in the vault, applied during generation.) Add a step for it (`place_element`/`edit_example_map`) only if the brief or an already-placed Rule genuinely implies it — otherwise a step with `edit_example_map`'s `add_question` operation. Run the plan.

### 4. Simplifier (review pass, known gap)

A plan step per touched slice, `run_wdyt`. Check the runner's own report (each step's `result.findings`) or `agentic-modeling/progress.txt`. **Stated gap, not solved here**: there is no merge/collapse mutation in `board-mutations.mjs` yet, so if this pass spots genuinely duplicate slices, that's a finding to report to the human, not something this skill can act on directly.

### 5. Score

If the plan's top-level `specId` was set, the runner's report already includes `ambiguityScore` — no separate call needed. Otherwise: `node mcp-server/ambiguity-score.mjs <specId> <boardId>`. Read the four dimensions and their `detail` strings — they tell you *what's* still weak, which is what the next pass (if any) should target. If `readyForHandoff` is `true`, stop the loop and go to "Finishing."

**If a plan halts early** (the runner exits non-zero): read the halted step's `reason` in the report. A halt from a real sanitizer rejection or a genuine mutation error (e.g. an invalid `laneId`) means *this pass's own step was wrong* — fix that step's args, don't route around the rejection. Don't treat a halt as license to fall back to raw `task-queue.mjs`/`agentic-worker.mjs` calls to "get past it."

## When to stop

- `readyForHandoff: true` from `ambiguity-score.mjs` — the honest, mechanical signal, never self-assessed.
- 3 passes completed without clearing the gate — stop anyway and hand the board to the human as-is, with the current score and its `detail` strings reported plainly. An Interview that loops forever chasing a perfect score is worse than an honest partial board with visible open Questions.
- Any point where sanitization rejects a prompt for a reason that isn't "this Interview pass wrote a bad JSON shape" — that's a signal something is wrong with the brief or the loop's own logic, not something to route around.

## Finishing

Once `readyForHandoff` is true (or the pass budget is spent and a human accepts the board as-is), freeze the spec so a later Interview run can't silently rewrite already-accepted content — a one-step plan, or the raw call if you'd rather not write a file for one step:

```bash
node mcp-server/task-queue.mjs add --board <boardId> --session <sessionId> '/freeze_spec {"specId":"<specId>"}'
node mcp-server/agentic-worker.mjs
```

Report back to whoever asked for this: the boardId/specId, the final ambiguity score, how many passes it took, the elapsed time (the runner's report already has this — don't estimate it), and — honestly — every unresolved Question left on the board. A board with open Questions is a legitimate, expected outcome of an honest Interview, not a failure of this skill.
