#!/usr/bin/env node
// Fresh read/write access to committed board JSON, for the Agentic
// Modeling write tools. Unlike mcp-server/index.mjs's module-level `board`
// const (loaded once, fine for read-only tools), every write tool needs to
// re-read the file immediately before mutating — otherwise two writes
// in the same server lifetime would silently clobber each other.
//
// See docs/adr/0003-agentic-modeling-write-path.md for why this writes
// directly to the committed file rather than anywhere else.
//
// Generalized 2026-09-30 (docs/adr/0004-interview-harness.md) to resolve a
// path per `boardId` instead of always targeting PowerGym's board — the
// Interview harness needs to seed a brand-new board (a boardId nobody has
// created a file for yet), not just edit an existing one. `task.boardId`
// on a queued task already existed as a field before this — it was just
// never threaded through to an actual file path.

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, "..", "src", "data");

/** Kept as the default path — every call site written before this
 * generalization (index.mjs's read-only tools, the old single-board
 * agentic-worker invocation) keeps working unchanged. */
export const BOARD_PATH = join(DATA_DIR, "powergym-board.json");

/** Resolve a boardId to its committed JSON path. `null`/`undefined`/
 * `"powergym"` all resolve to the original default path — not a special
 * case, just what the naming convention (`<boardId>-board.json`) already
 * produces for "powergym", kept explicit for backward compatibility with
 * code written before boardId existed. */
export function boardPathFor(boardId) {
  if (!boardId || boardId === "powergym") return BOARD_PATH;
  return join(DATA_DIR, `${boardId}-board.json`);
}

/**
 * Read a board fresh. A path that doesn't exist yet is not an error here —
 * it's the honest shape of "a brand-new board nobody has written to disk
 * yet": returns an empty board skeleton rather than throwing, so the
 * Interview harness can seed a new specId from nothing. Nothing is written
 * to disk until writeBoard is actually called — reading never has a side
 * effect.
 */
export function readBoard(path = BOARD_PATH) {
  if (!existsSync(path)) {
    return { nodes: [], edges: [], seedExampleMaps: {} };
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function writeBoard(board, path = BOARD_PATH) {
  writeFileSync(path, JSON.stringify(board, null, 2) + "\n");
}

const LOCK_SUFFIX = ".lock";
const DEFAULT_LOCK_TIMEOUT_MS = 5000;
const LOCK_POLL_MS = 20;

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Run a synchronous read-modify-write against `boardPath` while holding
 * an exclusive, cross-process lock on it. Added 2026-09-30 after a real
 * live concurrency test (10 `agentic-worker.mjs` processes racing one
 * board, ADR 0004's demo) proved a genuine bug: `task-queue.mjs`'s
 * atomic claim only prevents two workers from processing the *same task*
 * twice — it does nothing to stop two workers processing *different*
 * tasks against the *same board file* from racing `readBoard`/
 * `writeBoard` and silently losing each other's writes. 10 concurrent
 * single-node-placement tasks produced a board with 7 nodes, not 10,
 * before this fix — this isn't a hypothetical, it was reproduced.
 *
 * The lock is a directory (`<boardPath>.lock`) — `mkdirSync` is atomic on
 * every platform Node supports, so "is it locked" and "acquire it" are
 * one indivisible operation, no separate check-then-act race. A lock
 * held past `DEFAULT_LOCK_TIMEOUT_MS` is treated as stale (a crashed
 * holder) and broken, loudly, rather than left to hang a caller forever
 * — a stated tradeoff: a legitimately slow write inside that window
 * would have its lock stolen. Fine for this queue's own scale (small
 * JSON files); not a pattern to copy verbatim for a long critical
 * section.
 */
export function withBoardLock(boardPath, fn, { timeoutMs = DEFAULT_LOCK_TIMEOUT_MS } = {}) {
  const lockPath = boardPath + LOCK_SUFFIX;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      if (Date.now() > deadline) {
        console.error(`board-store: breaking a stale lock at ${lockPath} after ${timeoutMs}ms`);
        try {
          rmSync(lockPath, { recursive: true, force: true });
        } catch {
          // Lost the race to break it too — someone else's cleanup beat us here; loop and try to acquire again.
        }
        continue;
      }
      sleepSync(LOCK_POLL_MS);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}
