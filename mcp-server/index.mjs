#!/usr/bin/env node
// stdio transport entry point for the MCP server.
//
// Design note (Ouroboros-inspired reframe, decided 2026-09-02): rather than
// hand-building a per-harness export adapter, expose the board through one
// protocol every major harness already speaks. The canonical data stays the
// same JSON schema the import adapter and the React app both already use —
// this server is a thin protocol wrapper around it, not a second source of
// truth.
//
// v2 (2026-09-14) adds the verification-spine surface: slice listing,
// Layer 2 Example Maps, and the specifications[] export (WS3).
//
// v3 (2026-09-23) adds Agentic Modeling's write tools (place_element,
// edit_timeline, edit_example_map, run_wdyt).
//
// v4 (2026-10-06, docs/adr/0005): this repo stores no board of its own.
// Every tool reads fresh per call via board-store.mjs, keyed by a required
// `boardId` resolved against `NOMOTHETES_BOARD_DIR` (the target project's own
// directory) — there is no module-level `board` const and no bundled board
// JSON anywhere in this repo. The "read tools load once at startup, write
// tools re-read fresh" split from v3 is gone along with it: every tool is now
// a write tool's shape (fresh read, no mutation for the read-only ones),
// which also fixes a staleness bug the old split had by construction — a read
// tool could never see a write another call just made in the same server
// process.
//
// v5 (self-host quickstart): the 13 tool registrations moved to
// tools.mjs so this stdio entry and http-server.mjs's Streamable HTTP entry
// share one surface instead of maintaining two copies. This file is now only
// the transport.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBoardMcpServer } from "./tools.mjs";

const server = createBoardMcpServer();

const transport = new StdioServerTransport();
await server.connect(transport);
