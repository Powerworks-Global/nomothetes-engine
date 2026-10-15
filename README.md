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

This repo is the open-core engine: the canvas, the board data model, and a bring-your-own-harness ("BYOH") way to generate or edit a board with a coding agent. Owned by [Powerworks-Global](https://github.com/Powerworks-Global) — a separate private repo ([`nomothetes`](https://github.com/Powerworks-Global/nomothetes), access via Powerworks-Global) holds the Nomothetes-branded commercial layer (billing/stakeholder-digest exporters, compliance tooling) on top of what's here; see [CONTRIBUTING.md](CONTRIBUTING.md).

This is exploratory, pre-production tooling — see [Scope](#scope) below for exactly what's in and out right now.

## Quickstart

```bash
npm install
npm run dev
```

Opens the canvas at `http://localhost:5173` on a **blank** board. That is deliberate, not a missing demo: [ADR 0005](docs/adr/0005-board-storage-lives-outside-this-repo.md) decided this repo stores no board data of its own — every board belongs to the project it models — so there is no board JSON here for the dev server to bundle. To see a populated board, either use the self-host stack below (it seeds one by running the Interview harness) or point the canvas at a board your own tooling wrote.

To start a board of your own rather than exploring a seeded one, see [docs/plan.md](docs/plan.md) for the current state of board creation, or use the [Interview harness](#whats-in-the-repo) to generate a first draft from a written brief via a coding agent.

## Self-host quickstart (Docker)

Everything below is a command that was actually run, in a fresh clone, with the responses it returned. Timings at the end.

**Prerequisites:** Docker Engine 20.10+ with the Compose v2 plugin (`docker compose version`, note the space), ports 5173 and 3001 free on localhost, ~2 GB free RAM. No `npm install` on the host — the build happens inside the image.

```bash
git clone https://github.com/Powerworks-Global/nomothetes-engine.git
cd nomothetes-engine
docker compose up -d --build
```

One service, both halves of the product, plus the volume the board lives on:

| Endpoint | What it is |
|---|---|
| `http://localhost:5173` | the canvas |
| `http://localhost:5173/boards` | which boards this volume holds (read-only view of the board directory) |
| `http://localhost:3001/mcp` | the MCP server, Streamable HTTP — the same 13 tools the stdio server exposes |
| volume `nomothetes-boards` | mounted at `/app/boards`; the board files, and the only state in the stack |

Both ports are published on `127.0.0.1` only, and that is a security decision rather than a convenience: the MCP endpoint can write to the board, there is no authentication in this product yet ([ADR 0006](docs/adr/0006-identity-and-board-ownership-are-delegated-to-the-customers-own-git-host.md)), and this stack serves plain HTTP, which [ADR 0010](docs/adr/0010-transit-security-tls13-and-cert-pinning.md) permits only behind a TLS-terminating proxy — out of this quickstart's scope, so the loopback binding is what keeps the scope limit honest. To reach it from another machine you need that proxy (or an SSH tunnel), and you will also need to add the hostname your clients send in their `Host` header to `MCP_ALLOWED_HOSTS` in `docker-compose.yml` — Host-header validation is on by default to block DNS rebinding against an unauthenticated local server.

### What a working board looks like

On first start the container runs the Interview harness against an empty board volume — the committed pass-1 plans ([`mcp-server/fixtures/interview-plans/`](mcp-server/fixtures/interview-plans/)) replayed through the real queue/worker path — and writes the result to `nomothetes-self-board.json` on the volume. So the board you land on is not a demo fixture shipped in this repo (there are none, per ADR 0005); it is what the product actually produces from real committed content. It is small on purpose: one story-arc (`board-co-review`), one slice (`invite-co-reviewer`), 4 nodes, 2 edges, and one Example Map holding a Rule, an Example with a Given/When/Then, and **two unresolved Question cards**. Those open questions are not a flaw in the demo — they are the Interview harness leaving the genuine ambiguities a first pass cannot resolve visible, which is the thing the harness is for. `docker compose logs nomothetes` shows the run that produced it, including the mechanical ambiguity score (`combinedScore: 0.875`, `readyForHandoff: false`, threshold 0.8 — one pass short of ready, because of those two questions).

The canvas and the MCP server read the same file over the same volume: write through an MCP tool and `GET /boards` reports the change on the next request, no restart or rebuild involved.

### Checking it over HTTP (no browser needed)

MCP's Streamable HTTP transport wants both JSON and event-stream in `Accept`, a session id from `initialize` reused on every later request, and the `notifications/initialized` step before any tool call — skip that last one and tools answer "Server not initialized". This is the exact sequence that was run:

```bash
# 1. initialize, and keep the session id
curl -s -D headers.txt -o /dev/null -X POST http://localhost:3001/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"quickstart","version":"1"}}}'
SID=$(grep -i mcp-session-id headers.txt | tr -d '\r' | awk '{print $2}')

# 2. finish the handshake (required before tools/call)
curl -s -o /dev/null -X POST http://localhost:3001/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'

# 3. what the tools are (13)
curl -s -X POST http://localhost:3001/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | grep -o '"name":"[a-z_]*"' | wc -l

# 4. read the seeded board
curl -s -X POST http://localhost:3001/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_story_arcs","arguments":{"boardId":"nomothetes-self"}}}'
```

Step 4 returns (JSON-RPC arrives as an SSE `data:` line):

```
event: message
data: {"result":{"content":[{"type":"text","text":"[\n  {\n    \"specId\": \"board-co-review\",\n    \"nodeCount\": 4,\n    \"edgeCount\": 2\n  }\n]"}]},"jsonrpc":"2.0","id":3}
```

And the harness working against that board — `run_wdyt`, the analysis-only check the Interview's Simplifier pass runs, reporting the two open questions rather than inventing answers:

```bash
curl -s -X POST http://localhost:3001/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"run_wdyt","arguments":{"boardId":"nomothetes-self","sliceId":"invite-co-reviewer"}}}'
```

```
Unresolved Question card: "Does freezing require the Co-Reviewer's explicit approval, or just that they were invited? The brief only says 'invite', not 'approve'."
Unresolved Question card: "What happens if the Co-Reviewer never responds — can the Facilitator freeze anyway, or does the invite block forever?"
```

A write, and proof the canvas sees it without a restart:

```bash
curl -s -X POST http://localhost:3001/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -H "mcp-session-id: $SID" \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"place_element","arguments":{"boardId":"nomothetes-self","specId":"board-co-review","sliceId":"freeze-spec","sliceType":"command","laneId":"actor","label":"Smoke Test Actor"}}}'

curl -s http://localhost:5173/boards   # nodeCount goes 4 -> 5
```

### Restart: does the board survive?

This is the failure mode that matters for self-hosting, so it is a documented step and not an assumption:

```bash
docker compose restart
curl -s http://localhost:5173/boards
```

The board is still there with the write on it (`nodeCount: 5` above), and `docker compose logs nomothetes` says `"reason": "board already exists - left untouched"` — first-start seeding is idempotent, so a restart never resets a board you have been editing. Deleting the volume (`docker compose down -v`) is what puts you back to a fresh seed.

### Pointing a coding agent at it

The HTTP endpoint is what a harness on another machine uses; the stdio server stays the way to register it on the same machine:

```json
{ "mcpServers": { "nomothetes": { "url": "http://localhost:3001/mcp" } } }
```

### Shutting down

```bash
docker compose stop        # keeps the board volume
docker compose down        # containers gone, board volume kept
docker compose down -v     # board volume deleted too
```

### Timings

Measured in a fresh clone of this branch on the machine the quickstart was verified on (Docker 20.10.24, Compose v5.6.0) — recorded, not estimated:

| Step | Measured |
|---|---|
| `git clone` | 0.55–0.6s |
| `docker compose up -d --build`, image had to be built | 49.8s |
| same build with `--no-cache` | 45.2s |
| same command with every layer already cached | 12.0s |
| `docker compose up -d` → first successful `GET /boards` | 0.22s |
| `docker compose restart` → board served again | 0.70–0.92s |
| `docker compose down` + `up -d` (volume kept) → board served again | 1.24s |
| **clone → working board over HTTP** | **~51s** worst case here |

So the fifteen-minute budget is mostly you reading this file: the machine's share is under a minute. Two caveats, stated rather than hidden. The build reused a warm Docker layer cache and `node:22.20.0-alpine3.21` (161 MB) was already in the local image store — on a machine pulling that image for the first time, the pull is the one line that depends on your link, and it was not separately timed here. And every number above is Docker on one specific box.

One more thing this verification did not do: it never opened a browser, because there isn't one on that machine. What "the board shows up in the canvas" was checked to mean is that the built canvas bundle contains the board loader and that the two requests it makes — `GET /boards`, then `GET /boards/<id>-board.json` — return a board the canvas's own validation accepts. The rendered canvas itself is unverified here.

Why the canvas is served by `scripts/selfhost-server.mjs` rather than `vite preview`: `npm run build` needs the dev dependencies (typescript, vite) and so does previewing, but the runtime image installs production dependencies only — a quickstart whose web server is a devDependency is a quickstart that works on a developer's machine and nowhere else.

## What's in the repo

| Path | What it is |
|---|---|
| `src/` | The canvas itself — React Flow app, lane layout, node/edge components |
| `mcp-server/` | An [MCP server](mcp-server/README.md) (13 tools, read + write) exposing the board to any MCP-compatible harness (Claude Code, Gemini CLI, etc.), over stdio (`index.mjs`) or Streamable HTTP (`http-server.mjs`) |
| `mcp-server/tools.mjs` | The single registration of those 13 tools that both transports share — the board write path lives here and nowhere else |
| `mcp-server/interview-runner.mjs` | Runs a brief-to-board Interview plan end to end through the task queue/worker path — see the [Interview skill](.claude/skills/eventmodeling-interview/SKILL.md) and [ADR 0004](docs/adr/0004-interview-harness.md) |
| `scripts/export-specifications.mjs` | Turns a slice's Example Map into a `specifications[]` array for downstream test generation (one test per specification) |
| `scripts/import-eventmodelers.mjs` | Optional import path from a board already modeled in a compatible external tool's export format — see [Acknowledgments](#acknowledgments) below. Not required to use this project |
| `scripts/selfhost-server.mjs` | The self-host stack's web server: built canvas plus a read-only HTTP view of the board volume |
| `scripts/seed-demo-board.mjs` | Seeds the quickstart's first-start board by replaying the committed Interview plans through the real queue/worker path |
| `Dockerfile`, `docker-compose.yml`, `start-services.mjs` | The [self-host quickstart](#self-host-quickstart-docker): one image, canvas + MCP over HTTP + persistent board volume ([ADR 0012](docs/adr/0012-self-host-quickstart-single-image-and-seeded-demo-board.md)) |
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

**Martin Dilger** (Nebulit GmbH) built [eventmodelers.ai](https://eventmodelers.ai), a commercial Event Modeling product, and the subsequent tooling around it that this project learned from and is compatible with — `scripts/import-eventmodelers.mjs` optionally reads a board exported from it, for anyone who already has one modeled there. That compatibility option exists because his tooling proved out real export formats and real board patterns worth supporting; nothing in this repo requires it (there is no bundled board at all, per ADR 0005), but the path wouldn't be there without his work.

Neither Adam Dymitruk nor Martin Dilger is affiliated with this project — this acknowledgment is a credit, not a claim of endorsement or partnership.

## Related documentation

- [docs/plan.md](docs/plan.md) — project background, scope, and roadmap
- [docs/solution-architecture.md](docs/solution-architecture.md) — how the pieces fit together and why
- [docs/adr/](docs/adr/) — the decision log
- [mcp-server/README.md](mcp-server/README.md) — MCP server tools and how to register it with a harness
