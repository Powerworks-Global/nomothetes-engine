# Nomothetes MCP server

Exposes Nomothetes's board data over the Model Context Protocol, so any MCP-compatible harness (Claude Code, Codex, Gemini CLI, etc.) can query it directly — no per-harness export adapter needed. See the design note at the top of `index.mjs` for why this replaces the originally-planned per-harness Markdown/YAML exporters.

## Tools

Every tool takes a required `boardId`, resolved against `NOMOTHETES_BOARD_DIR` — this repo stores no board of its own ([ADR 0005](../docs/adr/0005-board-storage-lives-outside-this-repo.md)), so there is no default board to fall back to and no board loaded at server start: every tool reads the board file fresh per call.

Read-only:

- `list_story_arcs` — every story-arc currently on the board, with node/edge counts.
- `get_story_arc(specId)` — full nodes/edges for one story-arc, in the canvas's own schema.
- `search_elements(query)` — case-insensitive substring search across every arc's node labels.
- `list_slices(specId?)` — slices (vertical buildable units), optionally filtered to one arc; each entry flags `hasExampleMap`.
- `get_example_map(sliceId)` — a slice's Layer 2 Example Map (Rule/Example/Question cards, with Given/When/Then).
- `export_specifications(sliceId)` — a slice's Example Map → `specifications[]` array (the verification spine; refuses on unresolved Question cards).
- `get_slice_rules(sliceId)` / `get_slice_examples(sliceId)` — just the Rule cards, or just the Examples with their scenarios, without the full map/graph.

Write (Agentic Modeling — see [ADR 0003](../docs/adr/0003-agentic-modeling-write-path.md); each re-reads the board file fresh immediately before mutating, inside `withBoardLock`, unlike the read-only tools above):

- `place_element(specId, sliceId, sliceType, laneId, label, afterNodeId?, boardId?)` — add an Actor/Screen/Action/Outcome/ownedData node. Rejects if `specId` is frozen.
- `edit_timeline(operation, ..., boardId?)` — add/rename/reorder Action/Outcome nodes (`operation`: `add`/`rename`/`reorder`).
- `edit_example_map(sliceId, operation, ..., boardId?)` — add/edit Rule/Example/Question cards (`operation`: `add_rule`/`add_example`/`add_question`/`edit_card`).
- `run_wdyt(sliceId, boardId?)` — analysis-only data-continuity check (missing Rule links, incomplete scenarios, unresolved Questions). **Never mutates** — verified by hash comparison in tests and in `smoke-test.mjs`.
- `freeze_spec(specId, boardId?)` — make a specId immutable to future `place_element` calls (Ouroboros' immutable-seed-specs discipline). Throws if already frozen; doesn't guard `edit_timeline`/`edit_example_map` (stated scope limit, see ADR 0004).

These aren't meant to be called ad hoc by just any MCP client — they're the primitives `agentic-worker.mjs` calls when processing a queued task. See [docs/agentic-modeling-usage.md](../docs/agentic-modeling-usage.md) for how to actually queue one, or [.claude/skills/eventmodeling-interview/SKILL.md](../.claude/skills/eventmodeling-interview/SKILL.md) for the brief-to-board Interview protocol that drives them end to end.

## Running it

Both entry points register the same tool surface from `tools.mjs` — there is one board write path, and a transport may not define its own copy of it (`http-server.test.mjs` asserts the HTTP surface matches, so the two can't drift apart).

### stdio (for a harness on the same machine)

```bash
NOMOTHETES_BOARD_DIR=/path/to/target/project node mcp-server/index.mjs
```

Speaks stdio JSON-RPC — not meant to be run directly by a human, only spawned by an MCP client. `smoke-test.mjs` drives it directly for manual verification without needing an external harness installed.

### Streamable HTTP (for anything else, incl. the Docker quickstart)

```bash
NOMOTHETES_BOARD_DIR=/path/to/target/project MCP_HOST=127.0.0.1 MCP_PORT=3001 node mcp-server/http-server.mjs
```

Stateful sessions: `initialize` returns an `Mcp-Session-Id`, reuse it on every later request, and send `notifications/initialized` before the first `tools/call`. Requests naming a session the server doesn't know get a 400 rather than a half-served call.

Two things a client has to satisfy, both deliberate:

- **`Accept: application/json, text/event-stream`** on `/mcp` — the transport answers JSON-RPC as an SSE body, so a curl that asks for only `application/json` gets a 406.
- **`Host` header allowlist** — binding `0.0.0.0` (what the container does, so a published port can reach it) opts out of the SDK's automatic localhost-only DNS-rebinding protection, so `MCP_ALLOWED_HOSTS` names the accepted hosts instead (default `localhost,127.0.0.1,::1`). Add a name here when another container reaches this service by container name.

Serving this over plain HTTP is a quickstart scope limit, not a transit-security decision: [ADR 0010](../docs/adr/0010-transit-security-tls13-and-cert-pinning.md) requires TLS 1.3 for a real deployment, and `docker-compose.yml` publishes the port on `127.0.0.1` only until there is authentication in front of it (ADR 0006's identity layer is unbuilt).

## Registering with Claude Code

Add to `.mcp.json` in a project that wants to query this board:

```json
{
  "mcpServers": {
    "nomothetes": {
      "command": "node",
      "args": ["/absolute/path/to/nomothetes-engine/mcp-server/index.mjs"],
      "env": { "NOMOTHETES_BOARD_DIR": "/absolute/path/to/the/target/project" }
    }
  }
}
```

A harness on another machine (or one that can't spawn a local process) uses the HTTP transport instead: `{ "url": "http://localhost:3001/mcp" }`.

Any other MCP-compatible harness registers it the same way — a stdio command, same as any other MCP server. That's the whole point of this reframe: one server, many harnesses, instead of one exporter per harness.
