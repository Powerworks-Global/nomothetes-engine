#!/usr/bin/env node
// Agentic Modeling's task queue — a directory-based state machine, ported
// from AgentOS's tasks.py/inbox.py/worker.py pattern (Python original lives
// at ~/Code/AgentOS/pilot per this repo's own vault notes; not directly
// importable since this codebase is Node/TypeScript, so the atomic-claim
// mechanism is ported rather than reused).
//
// Claim is an atomic `fs.renameSync` (pending/ -> processing/) — the same
// POSIX rename atomicity AgentOS relies on to prevent double-processing by
// concurrent workers. Priority ordering (priority:true first, then earliest
// createdAt) comes from PowerGym's own agentic-modeling/CLAUDE.md pattern,
// since AgentOS's queue is FIFO-only and has no priority field.
//
// See docs/adr/0003-agentic-modeling-write-path.md for the write-target
// decision this queue feeds into.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const STATES = ["pending", "processing", "done", "failed"];

/**
 * Create a task store rooted at `baseDir` (e.g. `agentic-modeling/inbox`).
 * Each state is its own subdirectory; a task is one JSON file that moves
 * between them via atomic rename.
 */
export function createTaskStore(baseDir) {
  for (const state of STATES) {
    mkdirSync(join(baseDir, state), { recursive: true });
  }

  function pathFor(state, id) {
    return join(baseDir, state, `${id}.json`);
  }

  function readTask(state, id) {
    return JSON.parse(readFileSync(pathFor(state, id), "utf-8"));
  }

  /**
   * Add a new task. `prompts` is an array of raw prompt strings (sanitized
   * later, at claim time — not here, so the queue itself stays a dumb
   * store). `priority` defaults to false (PowerGym's own convention:
   * priority:true tasks are claimed before any non-priority task,
   * regardless of age). `sessionId` (added with the Interview harness,
   * ADR 0004) is an optional, purely observational tag — carried through
   * to the progress log so tasks from one Interview run (or one manual
   * multi-task session) are distinguishable in a shared, possibly
   * concurrent, progress.txt without changing claim/ordering behavior at
   * all.
   */
  function addTask({ prompts, priority = false, boardId = null, sessionId = null }) {
    if (!Array.isArray(prompts) || prompts.length === 0) {
      throw new Error("addTask requires a non-empty prompts array");
    }
    const id = randomUUID();
    const task = { id, prompts, priority, boardId, sessionId, createdAt: new Date().toISOString() };
    writeFileSync(pathFor("pending", id), JSON.stringify(task, null, 2));
    return task;
  }

  /**
   * Claim the highest-priority pending task: priority:true first, then
   * earliest createdAt among ties. Returns null if the queue is empty.
   * The rename is the atomic claim — once it succeeds, no other caller can
   * also claim the same task, even if they raced to read the same pending
   * listing first.
   */
  function claimNextTask() {
    const pendingDir = join(baseDir, "pending");
    const files = readdirSync(pendingDir).filter((f) => f.endsWith(".json"));
    if (files.length === 0) return null;

    const candidates = files
      .map((f) => {
        const id = f.replace(/\.json$/, "");
        try {
          return { id, task: readTask("pending", id) };
        } catch {
          return null; // skip a file that vanished between readdir and read (raced by another claimant)
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.task.priority !== b.task.priority) return a.task.priority ? -1 : 1;
        return a.task.createdAt.localeCompare(b.task.createdAt);
      });

    for (const { id } of candidates) {
      try {
        renameSync(pathFor("pending", id), pathFor("processing", id));
        return readTask("processing", id);
      } catch {
        // Another worker won the race for this specific task (rename failed
        // because the source no longer exists) - try the next candidate.
        continue;
      }
    }
    return null; // every candidate got claimed out from under us
  }

  /**
   * Claim one specific task by id, rather than "whichever is next" — the
   * same atomic rename as claimNextTask, just targeted. Added 2026-09-30
   * (ADR 0004) for interview-runner.mjs: an orchestrator that just queued
   * a task itself needs the guarantee it processes *that* task next, not
   * whatever else happens to be pending on a shared inbox at that instant
   * (a real possibility once more than one caller uses the same queue).
   * Returns null if the id doesn't exist in pending/ or was claimed by
   * someone else first — a genuine race, not an error to hide.
   */
  function claimTask(id) {
    try {
      renameSync(pathFor("pending", id), pathFor("processing", id));
      return readTask("processing", id);
    } catch {
      return null;
    }
  }

  /** Move a claimed task from processing/ to done/. */
  function completeTask(id) {
    if (!existsSync(pathFor("processing", id))) {
      throw new Error(`completeTask: no processing task with id "${id}"`);
    }
    renameSync(pathFor("processing", id), pathFor("done", id));
  }

  /** Move a claimed task from processing/ to failed/, recording the error. */
  function failTask(id, error) {
    const task = readTask("processing", id);
    task.error = error instanceof Error ? error.message : String(error);
    task.failedAt = new Date().toISOString();
    writeFileSync(pathFor("processing", id), JSON.stringify(task, null, 2));
    renameSync(pathFor("processing", id), pathFor("failed", id));
  }

  function listState(state) {
    return readdirSync(join(baseDir, state))
      .filter((f) => f.endsWith(".json"))
      .map((f) => readTask(state, f.replace(/\.json$/, "")));
  }

  return { addTask, claimNextTask, claimTask, completeTask, failTask, listState };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  // CLI: node task-queue.mjs list [state] | add [--board <id>] [--session <id>] [--priority] <prompt...>
  //
  // --board was added 2026-09-30 (docs/adr/0004-interview-harness.md) —
  // addTask() itself has accepted boardId since this queue's original
  // build, but nothing before the Interview harness needed the CLI to
  // expose it (every prior caller targeted PowerGym's default board).
  // --session added the same day for progress-log correlation.
  const baseDir = join(process.cwd(), "agentic-modeling", "inbox");
  const store = createTaskStore(baseDir);
  const [cmd, ...rest] = process.argv.slice(2);

  if (cmd === "add") {
    let boardId = null;
    let sessionId = null;
    let priority = false;
    const prompts = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "--board") {
        boardId = rest[++i];
      } else if (rest[i] === "--session") {
        sessionId = rest[++i];
      } else if (rest[i] === "--priority") {
        priority = true;
      } else {
        prompts.push(rest[i]);
      }
    }
    const task = store.addTask({ prompts, boardId, sessionId, priority });
    console.log(JSON.stringify(task, null, 2));
  } else if (cmd === "list") {
    const state = rest[0] ?? "pending";
    console.log(JSON.stringify(store.listState(state), null, 2));
  } else {
    console.error("Usage: node task-queue.mjs add [--board <id>] [--session <id>] [--priority] <prompt...> | list [pending|processing|done|failed]");
    process.exit(1);
  }
}
