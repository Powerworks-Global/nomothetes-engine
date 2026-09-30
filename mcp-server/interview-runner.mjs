#!/usr/bin/env node
// Thin orchestration layer over Agentic Modeling's task queue/worker, for
// running an Interview plan (.claude/skills/eventmodeling-interview/) as
// one command instead of manual shell choreography.
//
// Added 2026-09-30, after the Interview harness's first live demo made a
// real cognitive-load problem visible: running the "merge-duplicate-
// slices" demo by hand meant queuing a task, running the worker in a
// separate process, shelling back into the board JSON with a throwaway
// `node -e` one-liner to find the id of the node just placed, then
// hand-pasting that id into the next prompt — repeated per step. None of
// that bookkeeping is intrinsic to event modeling; it's an artifact of
// the interface. This module removes it: a plan's steps can reference an
// earlier step's result by a local `$ref` name, resolved automatically.
//
// Still goes through the real task queue and worker path (task-queue.mjs,
// agentic-worker.mjs's processAndFinalize) — not a shortcut that bypasses
// sanitization, the progress log, or the done/failed state machine. This
// is a caller of that path, not a second one.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { createTaskStore } from "./task-queue.mjs";
import { processAndFinalize } from "./agentic-worker.mjs";

/** Replace any `$name` string value (recursively, one level of nesting —
 * matching the flat shape every real skill's args object actually has) in
 * `args` with `refs[name]`. Throws clearly if `$name` is referenced before
 * that ref exists — never silently passes the literal string "$name" as
 * a real id, which would fail confusingly deep inside board-mutations.mjs
 * instead of here, at the one place that actually knows what went wrong. */
function resolveRefs(args, refs) {
  const resolved = {};
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.startsWith("$")) {
      const refName = value.slice(1);
      if (!(refName in refs)) {
        throw new Error(`interview-runner: step references "$${refName}", but no earlier step captured a ref by that name`);
      }
      resolved[key] = refs[refName];
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      resolved[key] = resolveRefs(value, refs); // e.g. edit_example_map's scenario object
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/**
 * Run an ordered list of steps (`{ ref?, skill, args }`) against one
 * board, through the real queue/worker path, one task per step. Stops at
 * the first step whose only prompt doesn't apply cleanly — an Interview
 * that silently presses on past a broken step is worse than one that
 * stops and says so (same discipline the Interview skill's own "when to
 * stop" section states for the ambiguity gate). Returns a report with
 * per-step timing, not just a pass/fail boolean — the metrics an operator
 * (or Abi Noda) would actually want to know whether this reduced real
 * friction, not just that it eventually worked once.
 */
export function runPlan(steps, { baseDir, boardId, sessionId = randomUUID(), progressPath } = {}) {
  const store = createTaskStore(baseDir);
  const refs = {};
  const stepReports = [];
  const runStart = Date.now();
  let halted = false;

  for (const [index, step] of steps.entries()) {
    const stepStart = Date.now();
    let resolvedArgs;
    try {
      resolvedArgs = resolveRefs(step.args, refs);
    } catch (err) {
      stepReports.push({ index, skill: step.skill, ref: step.ref, outcome: "halted", reason: err.message, elapsedMs: Date.now() - stepStart });
      halted = true;
      break;
    }

    const prompt = `/${step.skill} ${JSON.stringify(resolvedArgs)}`;
    const added = store.addTask({ prompts: [prompt], boardId, sessionId, priority: true });
    const claimed = store.claimTask(added.id);
    if (!claimed) {
      // A real, reportable condition, not swallowed: something else
      // claimed this exact task between us adding it and claiming it —
      // genuine concurrent contention on a shared inbox, not a bug to
      // paper over with a retry loop.
      stepReports.push({
        index,
        skill: step.skill,
        ref: step.ref,
        outcome: "halted",
        reason: `task ${added.id} was claimed by another caller before this runner could process it`,
        elapsedMs: Date.now() - stepStart,
      });
      halted = true;
      break;
    }

    const { results } = processAndFinalize(store, claimed, { progressPath });
    const primary = results[0];
    const elapsedMs = Date.now() - stepStart;
    stepReports.push({ index, skill: step.skill, ref: step.ref, outcome: primary.outcome, reason: primary.reason, result: primary.result, elapsedMs });

    if (primary.outcome !== "applied") {
      halted = true;
      break; // stop-on-first-failure, stated above
    }

    if (step.ref) {
      if (!primary.result?.id) {
        throw new Error(`interview-runner: step "${step.ref}" applied but its result has no .id to capture — check the skill's return shape`);
      }
      refs[step.ref] = primary.result.id;
    }
  }

  const applied = stepReports.filter((s) => s.outcome === "applied").length;
  return {
    sessionId,
    boardId,
    totalSteps: steps.length,
    stepsRun: stepReports.length,
    applied,
    halted,
    elapsedMs: Date.now() - runStart,
    steps: stepReports,
  };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  const [cmd, planPath] = process.argv.slice(2);
  if (cmd !== "run" || !planPath) {
    console.error("Usage: node interview-runner.mjs run <plan.json>");
    process.exit(1);
  }

  const plan = JSON.parse(readFileSync(planPath, "utf-8"));
  const baseDir = join(process.cwd(), "agentic-modeling", "inbox");
  const progressPath = join(process.cwd(), "agentic-modeling", "progress.txt");

  const report = runPlan(plan.steps, { baseDir, boardId: plan.boardId, sessionId: plan.sessionId, progressPath });

  if (plan.specId) {
    const { scoreAmbiguity } = await import("./ambiguity-score.mjs");
    const { readBoard, boardPathFor } = await import("./board-store.mjs");
    const board = readBoard(boardPathFor(plan.boardId));
    report.ambiguityScore = scoreAmbiguity(board, plan.specId);
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.halted ? 1 : 0);
}
