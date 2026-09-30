#!/usr/bin/env node
// Agentic Modeling's worker entrypoint — claims and processes ONE task per
// invocation (matches AgentOS's worker.py: meant to be invoked repeatedly
// by a scheduler, not to loop internally itself).
//
// Skill routing (PowerGym's own convention: a leading "/skill-name" on
// each prompt) maps directly onto the four MCP write tools registered in
// index.mjs — this script calls the same board-mutations.mjs functions
// those tools call, just without going through the MCP protocol, since a
// worker invocation has no MCP client attached.
//
// One board read + one board write per task (not per prompt) — all of a
// task's surviving prompts apply to the same in-memory board snapshot,
// then it's written back once.

import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createTaskStore } from "./task-queue.mjs";
import { sanitizePrompts } from "./sanitize-prompt.mjs";
import { readBoard, writeBoard, boardPathFor, withBoardLock } from "./board-store.mjs";
import { editExampleMap, editTimeline, freezeSpec, placeElement, runWdyt } from "./board-mutations.mjs";

const SKILLS = {
  place_element: placeElement,
  edit_timeline: editTimeline,
  edit_example_map: editExampleMap,
  run_wdyt: runWdyt,
  freeze_spec: freezeSpec,
};

const PROMPT_PATTERN = /^\/(\S+)\s+(\{.*\})\s*$/s;

/** Parse one prompt into { skill, args }, or return null if it doesn't
 * match the "/skill-name {json-args}" convention. */
function parsePrompt(prompt) {
  const match = PROMPT_PATTERN.exec(prompt.trim());
  if (!match) return null;
  const [, skill, argsJson] = match;
  try {
    return { skill, args: JSON.parse(argsJson) };
  } catch {
    return null;
  }
}

/**
 * Process one task against a board object already read fresh by the
 * caller. Mutates `board` in place for any write skill; run_wdyt never
 * mutates. Returns a result summary for the progress log — never throws
 * for a single bad prompt, only collects it as a failure entry.
 */
export function processTask(task, board) {
  const { kept, dropped } = sanitizePrompts(task.prompts);
  const results = dropped.map((d) => ({ prompt: d.prompt, outcome: "rejected", reason: `sanitizer: ${d.rule}` }));

  for (const prompt of kept) {
    const parsed = parsePrompt(prompt);
    if (!parsed) {
      results.push({ prompt, outcome: "failed", reason: "did not match /skill-name {json-args} syntax" });
      continue;
    }
    const skillFn = SKILLS[parsed.skill];
    if (!skillFn) {
      results.push({ prompt, outcome: "failed", reason: `unknown skill "${parsed.skill}" (expected one of ${Object.keys(SKILLS).join(", ")})` });
      continue;
    }
    try {
      const value = skillFn(board, parsed.args);
      results.push({ prompt, outcome: "applied", skill: parsed.skill, result: value });
    } catch (err) {
      results.push({ prompt, outcome: "failed", reason: err.message });
    }
  }

  return results;
}

/** Format one task's results into PowerGym's progress.txt entry shape.
 * sessionId/boardId (ADR 0004) are appended to the header line when
 * present — purely observational, so a shared progress.txt stays
 * greppable by session or board once more than one caller writes to it
 * (a single interview-runner.mjs run, or two concurrent workers on
 * different boards, otherwise produce indistinguishable entries). */
export function formatProgressEntry(task, results) {
  const tags = [task.sessionId && `session ${task.sessionId}`, task.boardId && `board ${task.boardId}`].filter(Boolean);
  const header = `## [${new Date().toISOString()}] — Task ${task.id}${tags.length ? ` (${tags.join(", ")})` : ""}`;
  const lines = [header, "", "Prompts processed:"];
  for (const r of results) {
    lines.push(`- [${r.outcome}] ${r.prompt}${r.reason ? ` — ${r.reason}` : ""}`);
  }
  const applied = results.filter((r) => r.outcome === "applied").length;
  const failed = results.length - applied;
  lines.push("", `Outcome: ${applied} applied, ${failed} failed/rejected.`, "");
  return lines.join("\n");
}

/**
 * Process an already-claimed task end to end: read the board fresh, apply
 * its surviving prompts, write the board back, log the result, and move
 * the task to done/failed. Extracted 2026-09-30 (ADR 0004) as the shared
 * core both claimAndProcessOne (below, claims whatever's next) and
 * interview-runner.mjs (claims a specific task it just queued itself, via
 * store.claimTask) drive — one real implementation of "apply a claimed
 * task," not two.
 *
 * The read-mutate-write is wrapped in withBoardLock (added 2026-09-30, a
 * real bug found by a live concurrent-worker test — see board-store.mjs's
 * own comment for the reproduction). Task-claim atomicity alone is not
 * enough once two workers can be processing *different* tasks against
 * the *same* board file at once.
 */
export function processAndFinalize(store, task, { progressPath } = {}) {
  try {
    const boardPath = boardPathFor(task.boardId);
    const results = withBoardLock(boardPath, () => {
      const board = readBoard(boardPath);
      const r = processTask(task, board);
      writeBoard(board, boardPath);
      return r;
    });

    const entry = formatProgressEntry(task, results);
    if (progressPath) appendFileSync(progressPath, entry + "\n");

    if (results.some((r) => r.outcome === "applied")) {
      store.completeTask(task.id);
    } else {
      store.failTask(task.id, "No prompts were successfully applied — see progress.txt.");
    }
    return { task, results, entry };
  } catch (err) {
    store.failTask(task.id, err);
    throw err;
  }
}

/**
 * Claim and process exactly one task, end to end. Returns `null` if the
 * queue was empty, or `{ task, results, entry }` on success. The CLI below
 * is a thin wrapper over this, not a second implementation of it.
 */
export function claimAndProcessOne(store, { progressPath } = {}) {
  const task = store.claimNextTask();
  if (!task) return null;
  return processAndFinalize(store, task, { progressPath });
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  const baseDir = join(process.cwd(), "agentic-modeling", "inbox");
  const progressPath = join(process.cwd(), "agentic-modeling", "progress.txt");
  const store = createTaskStore(baseDir);

  try {
    const outcome = claimAndProcessOne(store, { progressPath });
    if (!outcome) {
      console.log("No pending tasks.");
      process.exit(0);
    }
    console.log(`Claimed task ${outcome.task.id} (${outcome.task.prompts.length} prompt(s)).`);
    console.log(outcome.entry);
  } catch (err) {
    console.error(`Task failed: ${err.message}`);
    process.exit(1);
  }
}
