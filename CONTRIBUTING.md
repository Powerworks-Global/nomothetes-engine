# Contributing

This is currently a solo personal-project spike, private and not open for outside contributions — this file exists as groundwork for the point where it either gets handed off internally at Version1 or opened up, so the conventions are written down rather than only in one person's head.

## Working conventions

- **Real data over synthetic examples.** Where possible, build and test against PowerGym's actual imported board data (`src/data/powergym-board.json`), not invented sample data — the point of this project is proving the canvas against real, non-trivial content, not a toy demo.
- **Don't invent what the source doesn't have.** The import adapter (`scripts/import-eventmodelers.mjs`) deliberately represents missing data as absent rather than guessed — e.g. PowerGym's board carries zero field-level detail anywhere, and that's reflected as-is, not filled in. Extend this discipline to any new feature: absence is data, not a gap to paper over.
- **Every real change goes through `no-mistakes`** (this repo's validation gate — review, test, lint, CI) before merging. It has caught genuine correctness bugs (self-loop resolution, mislabeled edges, a screen-column layout bug) that manual review missed — don't skip it to move faster.
- **Architecture decisions get an ADR**, not just a commit message — see [docs/adr/](docs/adr/) for the format. If you're choosing between two real options and one wins for a reason worth remembering, write it down.

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
