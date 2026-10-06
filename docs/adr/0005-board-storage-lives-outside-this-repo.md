# ADR 0005: Board storage lives outside this repo, tied to the signed-in facilitator

**Status:** Accepted, 2026-10-06

## Context

Running the Interview harness for real against an external brief (a FHIR integration suite, a project with no relationship to this engine) surfaced something this codebase had never actually confronted: every board — the real one from that run, and every demo/fixture board before it — got written into `src/data/` of **this repo**. `mcp-server/index.mjs` eager-loaded one hardcoded board at startup; `board-store.mjs`'s `boardPathFor()` silently defaulted an unset or `"powergym"` boardId to a path inside this repo; the UI's `BOARD_SOURCES` registry bundled a board as a build-time import. None of this was wrong when there was exactly one board (PowerGym's), one operator, and one repo. It's structurally wrong for what this project actually is: a tool a facilitator uses to model *someone else's* project, not a thing that owns project content itself.

The real-world shape, stated plainly by the person actually running workshops with this: a facilitator logs in and identifies themselves, adds a new board, and that action creates (or targets) **a new git repo — the target project's own repo, not this one**. The board lives there, builds up through the workshop, participants interact with it, and the facilitator locks in sections as they're accepted. The engine is the tool; the board is the target project's artifact. Today's codebase has no concept of this at all — no identity/auth exists anywhere (confirmed absent in the Gap Analysis against the pricing strategy), and no mechanism creates or targets an external repo.

## Decision

1. **This repo stores no board data of its own, full stop.** No bundled JSON in `src/data/`, no board-shaped file the engine ships with or defaults to. `src/boards/registry.ts` has exactly one `BoardSource`: `"blank"`, which returns `{ nodes: [], edges: [] }` in memory — nothing on disk.
2. **`boardPathFor(boardId)` requires both a real boardId and `NOMOTHETES_BOARD_DIR`** (an environment variable, set once per process/session, pointing at wherever the board actually lives) — no implicit default, no fallback into this repo. Both omissions throw a clear error naming this ADR, not a silent wrong answer.
3. **Every MCP tool (`mcp-server/index.mjs`) now takes a required `boardId` and reads fresh per call.** The old split (read tools load once at startup from a module-level const; only write tools re-read fresh) is gone — there's no startup-time board to load any more, and the split had a real staleness bug by construction anyway (a read tool could never see a write another call just made in the same process).
4. **The identity/repo-creation layer this ultimately needs — a facilitator's login creating or targeting a real external git repo — is explicitly not built by this ADR.** This decision clears the ground (nothing in this repo assumes board == local file in `src/data` any more) without pretending the actual target mechanism exists yet. That's real future work, named here so it isn't silently assumed solved by "well, `NOMOTHETES_BOARD_DIR` exists now."

## Reasoning

Why this is a correctness fix, not a style preference: a tool that defaults to storing a client's board inside the tool's own open-source repo cannot be the shape of a real multi-project, multi-client product — every real board would either collide in one shared directory, or require the tool itself to be forked/copied per project, which defeats the entire point of a reusable engine. The bug was invisible until a real external brief was run through it for the first time; PowerGym's board being the only one ever used meant "defaults to inside this repo" and "defaults to the one real board" were indistinguishable in practice.

Why `NOMOTHETES_BOARD_DIR` (an env var) rather than a per-tool-call path argument: the MCP server's tool signatures already carry `boardId` to distinguish *which* board within a session; the *where* (which directory, i.e. which target repo a facilitator is currently working in) is a session-level fact, not a per-call one — matching how a real workshop session would actually be launched (point the server at today's target repo once, then work with however many boards live there).

## Consequences

- **Every existing bundled board is gone**: `powergym-board.json`, `version1-demo-board.json`, `version1-demo-messy-board.json`, `verify-edge-fix-board.json` — all deleted from `src/data/`. Anyone who was relying on PowerGym's board being there by default (the manual `smoke-test.mjs` script, in particular) needs an explicit `NOMOTHETES_BOARD_DIR` pointed at wherever that content now lives, or synthetic fixture content instead.
- **This is a breaking change to the MCP server's tool contract** — every read tool gained a required `boardId` parameter it didn't have before. Not backward compatible, deliberately: a silent default was the bug.
- **The real target mechanism (login → identity → new/targeted external git repo → board lives there → facilitator locks in sections) is still unbuilt.** This ADR is the prerequisite correction, not the feature. Next real step: design what "adding a board" actually does — create a new repo via some git host's API? Clone/init one locally and let the facilitator push it themselves? That's a genuinely new decision, not implied by anything here.
- **`freeze_spec`'s existing immutable-seed-specs mechanism (ADR 0004) is the natural fit for "facilitator locks in a section"** — it already exists, already guards `placeElement`, and needs no new code to serve that role once a board lives in a real external repo instead of this one's `src/data`.

## Related

[ADR 0004](0004-interview-harness.md) (the Interview harness this board storage serves; `freeze_spec`'s existing lock-in mechanism); [ADR 0003](0003-agentic-modeling-write-path.md) (the original single-board write path this generalizes away from entirely).
