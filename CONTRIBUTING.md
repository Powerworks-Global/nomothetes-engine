# Contributing

Powerworks-Global owns this project. This repo is the open-core generic engine half of **Nomothetes** — a separate private repo holds the Nomothetes-branded commercial layer (billing/stakeholder-digest exporters, compliance tooling) on top of what's here. This file exists so the working conventions are written down rather than only in one person's head, ahead of outside contributions being open.

## Working conventions

- **Real data over synthetic examples.** Where possible, build and test against PowerGym's actual imported board data (`src/data/powergym-board.json`), not invented sample data — the point of this project is proving the canvas against real, non-trivial content, not a toy demo.
- **Don't invent what the source doesn't have.** The import adapter (`scripts/import-eventmodelers.mjs`) deliberately represents missing data as absent rather than guessed — e.g. PowerGym's board carries zero field-level detail anywhere, and that's reflected as-is, not filled in. Extend this discipline to any new feature: absence is data, not a gap to paper over.
- **Every real change goes through `no-mistakes`** (this repo's validation gate — review, test, lint, CI) before merging. It has caught genuine correctness bugs (self-loop resolution, mislabeled edges, a screen-column layout bug) that manual review missed — don't skip it to move faster.
- **Architecture decisions get an ADR**, not just a commit message — see [docs/adr/](docs/adr/) for the format. If you're choosing between two real options and one wins for a reason worth remembering, write it down.
- **Non-core features must be cheap to delete.** Decided 2026-10-05: of deleteability/auditability/traceability as design goals for new features, deleteability is the strongest — the product's still finding its market (pricing undecided, feature requests not yet validated by real usage), so the cost of being wrong about a feature has to stay low. Concretely: prefer *additive* registration points (a new MCP tool, a new sibling exporter script, a new preset-catalog row) over edits deep inside shared core functions (`board-store.mjs`, the canvas's core render path). The exporter scripts (`scripts/export-*.mjs`) are the model to copy — each is a standalone file reading the same board shape; deleting one is deleting a file, not untangling a dependency web. New ADRs should state explicitly what would have to change to rip the feature back out — if the answer is "touch five unrelated files," that's a signal to restructure before merging, not after.

## Setup

```bash
npm install
npm run dev      # canvas at http://localhost:5173
npm run build    # typecheck + production build
```

To regenerate the imported board data after PowerGym's source board changes:

```bash
node scripts/import-eventmodelers.mjs <path-to-cloned-powergym>/specs/*/ > src/data/powergym-board.json
```

To run the MCP server standalone, see [mcp-server/README.md](mcp-server/README.md). For Agentic Modeling specifically (queuing/running tasks that edit the board), see [docs/agentic-modeling-usage.md](docs/agentic-modeling-usage.md) for day-to-day use and [AGENTS.md](AGENTS.md)'s Agentic Modeling section for extending it.

## Commit messages

Follow the existing history's style: a short present-tense summary line, body explaining *why* not just *what* when the reasoning isn't obvious from the diff. `no-mistakes`-authored commits are prefixed `no-mistakes(<step>):` — leave that convention alone, it's how gate-applied fixes are distinguished from human-authored ones in history.

## Issues — quick triage

This project just went public and feedback is actively wanted, including rough or incomplete reports — a one-line "this is broken" is more useful reported than not reported. What happens on your end:

- New issues get a first look fast, not left to go stale. If something's a genuine bug against real data (per the "real data over synthetic examples" convention above), it's prioritized over feature requests.
- If a report is missing something needed to act on it (repro steps, environment), expect a quick follow-up question rather than silence — not a template rejection.
- Small, well-scoped PRs fixing a reported bug are welcome even before a maintainer response, if you want to go that route — reference the issue number in the PR.
- No formal SLA yet (this is a brand-new public repo, not a funded support product) — but "quick" is the actual goal, not just a line in this file.
