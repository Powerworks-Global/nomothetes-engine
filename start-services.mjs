#!/usr/bin/env node
// One container, three steps: seed the demo board, then run the UI/board
// server and the MCP HTTP server as supervised children.
//
// Written deliberately small and dependency-free (node:child_process only):
// this is the container's PID 1 workload, so "if a service dies, the container
// exits with it" has to be behaviour of this file, not an aspiration - a
// stack that reports "up" while running half of itself is worse than one that
// exits and gets restarted.
//
// Seeding runs BEFORE the servers start, so the first request that lands after
// `docker compose up` already sees a board. It is idempotent
// (scripts/seed-demo-board.mjs leaves an existing board file alone), which is
// what keeps a restart from resetting a board the user has since edited.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const UI_PORT = process.env.UI_PORT ?? "5173";
const UI_HOST = process.env.UI_HOST ?? "0.0.0.0";
const MCP_PORT = process.env.MCP_PORT ?? "3001";
const MCP_HOST = process.env.MCP_HOST ?? "0.0.0.0";

function run(script, args = []) {
  return spawn(process.execPath, [join(root, script), ...args], { cwd: root, stdio: "inherit", env: process.env });
}

function seed() {
  return new Promise((done, fail) => {
    const child = run("scripts/seed-demo-board.mjs");
    child.on("exit", (code, signal) => (code === 0 ? done() : fail(new Error(`seed-demo-board exited ${signal ?? code}`))));
    child.on("error", fail);
  });
}

const children = new Map();
let shuttingDown = false;

function supervise(child, name) {
  children.set(child, name);
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    // One service dying leaves the other serving a half-working stack nobody
    // asked for: take it all down and let the restart policy do its job.
    console.error(`[start-services] ${name} exited (${signal ?? `code ${code}`}) - stopping the stack`);
    shutdown(code ?? 1);
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const [child, name] of children) {
    console.log(`[start-services] stopping ${name}`);
    child.kill("SIGTERM");
  }
  // Grace, then stop waiting: a child that ignores SIGTERM must not hang the
  // container through `docker compose down`'s own timeout.
  setTimeout(() => process.exit(code), 2000).unref();
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

try {
  await seed();
} catch (err) {
  // A stack that comes up with no demo board would be a mystery to debug from
  // the browser; say why it didn't start and stop.
  console.error(`[start-services] demo board seeding failed: ${err.message}`);
  process.exit(1);
}

supervise(run("scripts/selfhost-server.mjs"), "ui");
supervise(run("mcp-server/http-server.mjs"), "mcp");

console.log(`[start-services] UI:      bound to ${UI_HOST}:${UI_PORT} (published as http://localhost:${UI_PORT}/)`);
console.log(`[start-services] boards:  http://localhost:${UI_PORT}/boards`);
console.log(`[start-services] MCP:     bound to ${MCP_HOST}:${MCP_PORT} (published as http://localhost:${MCP_PORT}/mcp, Streamable HTTP)`);
console.log(`[start-services] board dir: ${process.env.NOMOTHETES_BOARD_DIR ?? "(unset - MCP tools will refuse to run, see ADR 0005)"}`);
