#!/usr/bin/env node
// Seed the self-host quickstart's demo board by RUNNING the Interview
// harness, not by shipping a board file.
//
// Why not just commit a demo board: ADR 0005
// (docs/adr/0005-board-storage-lives-outside-this-repo.md) says this repo
// stores no board data of its own — every board belongs to the project it
// models. A hand-written "demo board" fixture would have violated that twice
// over: once by being board data in the engine's repo, and once by being
// *invented* board data (a first-start experience built from labels nobody
// modelled is exactly the "don't invent what the source doesn't have" rule
// this repo states). So the demo board is what the product actually produces:
// the committed Interview plan fixtures in mcp-server/fixtures/interview-plans/
// replayed through the real task queue + worker path (interview-runner.mjs ->
// task-queue.mjs -> agentic-worker.mjs -> board-mutations.mjs), writing to the
// board volume. What appears on first start is a real board, built by the
// real write path, from real committed content — the same `board-co-review`
// specification this repo exports at specifications/storyboard-canvas-self/.
//
// Idempotent by construction: if the board file already exists, nothing runs.
// That is what makes first-start seeding and restart-of-a-stack-with-the-
// volume-already-populated two different, correct behaviours rather than a
// silent reset of the user's board.
//
// Usage: node scripts/seed-demo-board.mjs [--board <boardId>]

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runPlan } from "../mcp-server/interview-runner.mjs";
import { scoreAmbiguity } from "../mcp-server/ambiguity-score.mjs";
import { boardPathFor, readBoard } from "../mcp-server/board-store.mjs";
import { FACILITATOR_SEQUENCE } from "../mcp-server/facilitator-roles.mjs";

/** The board the quickstart shows on first start. Named for what it models —
 * this engine's own board-co-review event model — not for a demo-board numbering
 * scheme inherited from the fixture's original (now-deleted, ADR 0005) host
 * board. Override with --board / DEMO_BOARD_ID. */
export const DEFAULT_DEMO_BOARD_ID = "nomothetes-self";

const PLANS_DIR = new URL("../mcp-server/fixtures/interview-plans/", import.meta.url).pathname;

/** The committed pass-1 Interview plans for one spec, in the facilitator
 * sequence's own order — read off FACILITATOR_SEQUENCE rather than a
 * hardcoded list, so seeding follows the sequence ADR 0004 states even as
 * roles are added to it. Which spec gets seeded is not hardcoded either: it is
 * read from the fixtures themselves, and the fixture with the most authored
 * passes wins, so a second spec's plans can be dropped in without a code
 * change. A role with no committed plan file is skipped — the sequence is the
 * ideal pass list, not a promise that every pass has authored content. */
export function plansInSequenceOrder(dir = PLANS_DIR) {
  if (!existsSync(dir)) return [];
  const discovered = readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const role = FACILITATOR_SEQUENCE.find((r) => f.endsWith(`-${r}.json`));
      if (!role) return null;
      const plan = JSON.parse(readFileSync(join(dir, f), "utf-8"));
      return { role, path: join(dir, f), specId: plan.specId, plan };
    })
    .filter(Boolean);

  const perSpec = new Map();
  for (const d of discovered) perSpec.set(d.specId, (perSpec.get(d.specId) ?? 0) + 1);
  if (perSpec.size === 0) return [];
  const [specId] = [...perSpec.entries()].sort((a, b) => b[1] - a[1])[0];

  return FACILITATOR_SEQUENCE.map((role) => discovered.find((d) => d.role === role && d.specId === specId)).filter(Boolean);
}

/** Run the demo plans against `boardId`. Returns the per-plan reports plus the
 * resulting board's ambiguity score — the same mechanical stop-condition
 * signal the Interview skill uses, so the quickstart's "what a working board
 * looks like" is a real measurement rather than a screenshot. */
export function seedDemoBoard({
  boardId = DEFAULT_DEMO_BOARD_ID,
  baseDir = process.env.AGENTIC_INBOX_DIR ?? join(process.cwd(), "agentic-modeling", "inbox"),
  progressPath = process.env.AGENTIC_PROGRESS_FILE ?? join(process.cwd(), "agentic-modeling", "progress.txt"),
} = {}) {
  const path = boardPathFor(boardId);
  if (existsSync(path)) {
    return { seeded: false, boardId, path, reason: "board already exists - left untouched" };
  }

  const discovered = plansInSequenceOrder();
  if (discovered.length === 0) {
    throw new Error(`seed-demo-board: no pass-1 Interview plans found to seed from - the demo board is the harness's own output, so there is nothing to fall back to.`);
  }

  const plans = discovered.map(({ role, plan }) => {
    // plan.boardId names the board the fixture was originally authored
    // against ("version1-demo-messy", deleted by ADR 0005); the content of
    // the plan — spec, slices, labels, rules — is the real part, and
    // boardId only selects which board file these steps write to.
    return { role, plan, report: runPlan(plan.steps, { baseDir, boardId, sessionId: plan.sessionId, progressPath }) };
  });

  const specId = plans[0].plan.specId;
  const halted = plans.filter((p) => p.report.halted);
  return {
    seeded: halted.length === 0,
    boardId,
    path,
    specId,
    plansRun: plans.map((p) => ({ role: p.role, applied: p.report.applied, steps: p.report.totalSteps, elapsedMs: p.report.elapsedMs, halted: p.report.halted })),
    board: (() => {
      const b = readBoard(path);
      return { nodes: b.nodes.length, edges: b.edges.length, exampleMaps: Object.keys(b.seedExampleMaps ?? {}).length };
    })(),
    ambiguityScore: scoreAmbiguity(readBoard(path), specId),
  };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  const args = process.argv.slice(2);
  const flagIndex = args.indexOf("--board");
  const boardId = flagIndex !== -1 ? args[flagIndex + 1] : process.env.DEMO_BOARD_ID ?? DEFAULT_DEMO_BOARD_ID;
  const result = seedDemoBoard({ boardId });
  console.log(JSON.stringify(result, null, 2));
  // "Already seeded" is a success for a caller (a restart is not a failure),
  // so exit 0 covers both it and a fresh seed; anything else is a real failure.
  process.exit(result.seeded || result.reason ? 0 : 1);
}
