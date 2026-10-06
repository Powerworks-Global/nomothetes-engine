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
// path per `boardId` instead of always targeting one bundled board — the
// Interview harness needs to seed a brand-new board (a boardId nobody has
// created a file for yet), not just edit an existing one. `task.boardId`
// on a queued task already existed as a field before this — it was just
// never threaded through to an actual file path.
//
// Narrowed further 2026-10-06 (docs/adr/0005): this repo no longer bundles
// ANY board data or defaults to a path inside itself. boardPathFor always
// requires both a real boardId and NOMOTHETES_BOARD_DIR pointing outside
// this repo, at the target project's own directory.

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** Resolve a boardId to its committed JSON path. This repo holds no board
 * data of its own and has no default board directory — see
 * docs/adr/0005-board-storage-lives-outside-this-repo.md. Every board
 * belongs to the project it models, not to this engine, so the directory
 * it lives in must always come from the caller: `NOMOTHETES_BOARD_DIR`
 * (set once per process/session, pointed at the target project's own
 * repo) is the only source. Throws clearly rather than silently falling
 * back to somewhere inside this repo, which is exactly the thing ADR
 * 0005 exists to stop happening by accident. */
export function boardPathFor(boardId) {
  if (!boardId) {
    throw new Error(
      "boardPathFor: boardId is required - this engine has no default board (see docs/adr/0005).",
    );
  }
  const dir = process.env.NOMOTHETES_BOARD_DIR;
  if (!dir) {
    throw new Error(
      "boardPathFor: NOMOTHETES_BOARD_DIR is not set. Point it at the target project's own " +
        "repo/directory before running this server or CLI - this engine does not store boards " +
        "inside itself (see docs/adr/0005-board-storage-lives-outside-this-repo.md).",
    );
  }
  return join(dir, `${boardId}-board.json`);
}

/**
 * Read a board fresh. A path that doesn't exist yet is not an error here —
 * it's the honest shape of "a brand-new board nobody has written to disk
 * yet": returns an empty board skeleton rather than throwing, so the
 * Interview harness can seed a new specId from nothing. Nothing is written
 * to disk until writeBoard is actually called — reading never has a side
 * effect.
 */
export function readBoard(path) {
  if (!existsSync(path)) {
    return { nodes: [], edges: [], seedExampleMaps: {} };
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function writeBoard(board, path) {
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
