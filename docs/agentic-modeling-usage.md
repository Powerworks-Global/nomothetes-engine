# Agentic Modeling — usage guide

This is for anyone who wants to *use* Agentic Modeling (queue a task, see what it did) without necessarily reading or writing the code behind it. For how it's built, see `docs/solution-architecture.md`'s Agentic Modeling section and [ADR 0003](adr/0003-agentic-modeling-write-path.md). For how to extend it, see `AGENTS.md`.

**Honest caveat up front**: there's no UI for this yet. Queuing a task means running one command with a specifically-formatted string — closer to "comfortable copy-pasting a CLI command from this doc" than "no technical skill needed." If a friendlier front end gets built later, this doc is the thing that should get simpler.

## What it actually does

Nomothetes's board (the Event Modeling canvas — actors, screens, actions, outcomes, and each slice's Rule/Example/Question cards) normally only changes when a human edits it in the browser, or when the import script re-runs against a fresh PowerGym export. Agentic Modeling adds a second way to change it: you queue a task describing an edit, a worker process picks it up, checks it's safe, makes the change, and writes down what it did. Nothing happens live or automatically — someone (or something scheduled) has to run the worker for a queued task to actually take effect.

## Queuing a task

A task is one or more **prompts**. Each prompt has to be a specific format: `/skill-name {json arguments}`. There are four skills:

| Skill | What it does | Example prompt |
|---|---|---|
| `place_element` | Adds an Actor/Screen/Action/Outcome node to the board | `/place_element {"specId":"002a-member-registration","sliceId":"<slice-uuid>","sliceType":"command","laneId":"actor","label":"Front Desk Staff"}` |
| `edit_timeline` | Adds, renames, or reorders Action/Outcome nodes | `/edit_timeline {"operation":"rename","nodeId":"<node-id>","newLabel":"Confirm Booking"}` |
| `edit_example_map` | Adds or edits a slice's Rule/Example/Question cards | `/edit_example_map {"sliceId":"<slice-uuid>","operation":"add_rule","label":"Bookings must be confirmed within 24 hours"}` |
| `run_wdyt` | Checks a slice for gaps (missing rule links, incomplete scenarios, unanswered questions) — reports findings, changes nothing | `/run_wdyt {"sliceId":"<slice-uuid>"}` |
| `freeze_spec` | Makes a specId immutable to future `place_element` calls (Ouroboros' immutable-seed-specs discipline) | `/freeze_spec {"specId":"002a-member-registration"}` |

You don't need to hand-craft the JSON from scratch every time — ask whatever coding agent or harness you're using to produce a well-formed prompt for the change you want, or copy one of the examples above and adjust the fields. The worker itself doesn't understand plain English like "add a screen for login" — something upstream has to turn that into the right `/skill-name {...}` string first.

To queue one:

```bash
node mcp-server/task-queue.mjs add '/place_element {"specId":"002a-member-registration","sliceId":"<slice-uuid>","sliceType":"command","laneId":"actor","label":"Front Desk Staff"}'
```

A task can hold more than one prompt — queue it as multiple arguments and they'll all be processed together as one task:

```bash
node mcp-server/task-queue.mjs add '/place_element {...}' '/edit_example_map {...}'
```

## Running the worker

Queuing a task doesn't do anything by itself — a task sits in `agentic-modeling/inbox/pending/` until the worker runs:

```bash
node mcp-server/agentic-worker.mjs
```

Each run claims and processes **one** task, then exits. Run it again to process the next one. (This is deliberate — see `AGENTS.md` if you're wiring it into a scheduler instead of running it by hand.)

## Checking what happened

Two places to look:

- **`agentic-modeling/progress.txt`** — an append-only log, one entry per task, in the format `## [timestamp] — Task <id>` followed by each prompt's outcome (`applied`, `rejected`, or `failed`, with a reason for the latter two) and a summary count.
- **`agentic-modeling/inbox/done/`** vs. **`agentic-modeling/inbox/failed/`** — a completed task's JSON file lands in one of these, so you can see the original task alongside `progress.txt`'s account of what happened to it.

If a task ends up in `failed/`, check `progress.txt` for why — most commonly either a prompt didn't parse (bad JSON, or it wasn't dropped by the safety check below but didn't match a real skill name), or every prompt in the task got rejected by the safety check.

## What gets rejected, and why

Before anything reaches a skill, every prompt is checked for four things and dropped if it matches any of them — the task can still partially succeed if only some of its prompts are dropped:

- **Shell commands** — anything that looks like it's trying to run a command (`$(...)`, backticks, `rm`/`curl`/`sudo`-style invocations).
- **Reaching outside the project** — path traversal (`../`), absolute paths into `/etc/`, `/home/`, `/root/`, or anything that looks like it's fishing for a credential/secret/token.
- **Off-topic content** — requests that have nothing to do with event modeling.
- **Instructions trying to override the system** — phrasing like "ignore previous instructions" or "you are now a different assistant."

This exists because task prompts can come from anywhere — including, eventually, an LLM that itself received untrusted input — so the check runs on every prompt regardless of source, not just ones from an obviously suspicious place.

## Autonomy levels

`nomothetes.config.json`'s `agent.autonomyLevel` setting (`read-only` / `propose-only` / `write-with-review` / `autonomous`) states what a coding agent working in this repo is allowed to do — it's a statement of policy for whoever's operating the agent, not something Agentic Modeling's own code currently enforces automatically. If you're setting up Agentic Modeling for a team, treat this as the thing to agree on and write down (e.g. "queued tasks get reviewed before the worker runs" vs. "the worker runs on a schedule, unattended") rather than assuming a default.

## Turning a brief into tasks (Interview harness)

Everything above assumes you already know what prompts you want. If you're starting from a project/programme brief instead of a specific edit, see [.claude/skills/eventmodeling-interview/SKILL.md](../.claude/skills/eventmodeling-interview/SKILL.md) — a portable protocol for a coding agent to run a facilitated, ambiguity-gated interview against the brief and queue the resulting tasks itself. It's "the upstream" this doc's "something upstream has to produce well-formed prompts" line below refers to, for one specific upstream: a brief, not a one-off manual edit.

## Known gaps, plainly stated

- No friendly UI — see the caveat at the top.
- No reconciliation between agent writes and a human's unsaved in-browser Layer 2 edits (they use different storage — see the architecture doc). If both are being edited around the same time, check for conflicts by hand.
- The worker doesn't interpret free text — something upstream has to produce well-formed `/skill-name {json}` prompts.
