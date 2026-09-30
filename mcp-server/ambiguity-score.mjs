#!/usr/bin/env node
// Mechanical ambiguity scoring for the Interview harness (docs/adr/0004).
// Ouroboros-inspired (Interview -> Seed -> Execute -> Evaluate -> Evolve),
// but scored from REAL board state, never an LLM's self-report of its own
// output — same discipline as a sibling project's own check-spec-coverage.sh/
// check-spec-drift.sh eval-harness checks: a mechanical check an Interview
// pass can't talk its way past.
//
// Four dimensions, Ouroboros' own vocabulary, each mapped onto something
// this board schema can actually measure:
//   - goalClarity     — fraction of the specId's slices with a stated
//                        result (>=1 node in the action/outcome lanes).
//                        A slice with only an Actor/Screen names an
//                        interaction but never says what it accomplishes.
//   - constraints      — fraction of slices with >=1 linked Rule card
//                        (a stated business constraint on that slice).
//   - successCriteria  — fraction of Example cards that are both linked
//                        to a Rule and carry a complete Given/When/Then.
//   - context          — 1 minus the proportion of Example-Map cards that
//                        are still-unresolved Questions; a Question is
//                        the board's own "not understood yet" signal.
//
// combinedScore is the unweighted mean of the four. readyForHandoff also
// hard-requires zero unresolved Questions regardless of combinedScore —
// matching export-specifications.mjs's own hard-refusal-on-Question
// discipline elsewhere in this codebase, not a new rule invented here.

import { pathToFileURL } from "node:url";

const DEFAULT_THRESHOLD = 0.8;

function slicesFor(board, specId) {
  const bySlice = new Map();
  for (const node of board.nodes) {
    if (node.specId !== specId) continue;
    if (!bySlice.has(node.sliceId)) bySlice.set(node.sliceId, []);
    bySlice.get(node.sliceId).push(node);
  }
  return bySlice;
}

function goalClarity(sliceNodesById) {
  const slices = [...sliceNodesById.values()];
  if (slices.length === 0) return { score: 0, detail: "no slices found for this specId" };
  const withResult = slices.filter((nodes) => nodes.some((n) => n.laneId === "action" || n.laneId === "outcome"));
  return { score: withResult.length / slices.length, detail: `${withResult.length}/${slices.length} slices have a stated Action/Outcome` };
}

function constraints(board, sliceIds) {
  if (sliceIds.length === 0) return { score: 0, detail: "no slices found for this specId" };
  const withRule = sliceIds.filter((sliceId) => (board.seedExampleMaps?.[sliceId]?.nodes ?? []).some((n) => n.data?.nodeType === "rule"));
  return { score: withRule.length / sliceIds.length, detail: `${withRule.length}/${sliceIds.length} slices have >=1 Rule card` };
}

function successCriteria(board, sliceIds) {
  const examples = [];
  for (const sliceId of sliceIds) {
    const map = board.seedExampleMaps?.[sliceId];
    if (!map) continue;
    const ruleIds = new Set(map.nodes.filter((n) => n.data?.nodeType === "rule").map((n) => n.id));
    const linkedExampleIds = new Set(map.edges.filter((e) => ruleIds.has(e.source)).map((e) => e.target));
    for (const node of map.nodes) {
      if (node.data?.nodeType !== "example") continue;
      const scenario = node.data.scenario ?? {};
      const complete = ["given", "when", "then"].every((f) => scenario[f] && String(scenario[f]).trim().length > 0);
      examples.push({ linked: linkedExampleIds.has(node.id), complete });
    }
  }
  if (examples.length === 0) return { score: 0, detail: "no Example cards found for this specId" };
  const solid = examples.filter((e) => e.linked && e.complete).length;
  return { score: solid / examples.length, detail: `${solid}/${examples.length} Examples are Rule-linked with a complete Given/When/Then` };
}

function context(board, sliceIds) {
  let totalCards = 0;
  let unresolvedQuestions = 0;
  for (const sliceId of sliceIds) {
    const map = board.seedExampleMaps?.[sliceId];
    if (!map) continue;
    totalCards += map.nodes.length;
    unresolvedQuestions += map.nodes.filter((n) => n.data?.nodeType === "question").length;
  }
  if (totalCards === 0) return { score: 0, detail: "no Example Map content found for this specId", unresolvedQuestions: 0 };
  return {
    score: 1 - unresolvedQuestions / totalCards,
    detail: `${unresolvedQuestions} unresolved Question card(s) out of ${totalCards} total cards`,
    unresolvedQuestions,
  };
}

/**
 * Score one specId's ambiguity from real board state. Each dimension
 * carries a human-readable `detail`, not just a number — same "never
 * just a boolean" discipline as run_wdyt.
 */
export function scoreAmbiguity(board, specId, { threshold = DEFAULT_THRESHOLD } = {}) {
  const sliceNodesById = slicesFor(board, specId);
  const sliceIds = [...sliceNodesById.keys()];

  const dimensions = {
    goalClarity: goalClarity(sliceNodesById),
    constraints: constraints(board, sliceIds),
    successCriteria: successCriteria(board, sliceIds),
    context: context(board, sliceIds),
  };

  const combinedScore =
    (dimensions.goalClarity.score + dimensions.constraints.score + dimensions.successCriteria.score + dimensions.context.score) / 4;
  const unresolvedQuestions = dimensions.context.unresolvedQuestions ?? 0;
  const readyForHandoff = combinedScore >= threshold && unresolvedQuestions === 0;

  return { specId, sliceCount: sliceIds.length, dimensions, combinedScore, threshold, unresolvedQuestions, readyForHandoff };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  const { readBoard, boardPathFor } = await import("./board-store.mjs");
  const [specId, boardId] = process.argv.slice(2);
  if (!specId) {
    console.error("Usage: node ambiguity-score.mjs <specId> [boardId]");
    process.exit(1);
  }
  const board = readBoard(boardPathFor(boardId));
  console.log(JSON.stringify(scoreAmbiguity(board, specId), null, 2));
}
