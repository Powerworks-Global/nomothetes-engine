#!/usr/bin/env node
// Pure board-mutation functions for the Agentic Modeling write tools.
// Each function takes a board object (already read fresh by the caller)
// and mutates it in place; the MCP tool handlers in index.mjs own the
// read-mutate-write cycle via board-store.mjs. Kept separate from
// board-store.mjs so these can be unit tested against a plain in-memory
// board fixture, with no file I/O involved.

import { randomUUID } from "node:crypto";

const TIMELINE_LANES = ["action", "outcome"];
const ELEMENT_LANES = ["actor", "screen", "action", "outcome", "ownedData"];

function newNodeId(specId) {
  return `${specId}:${randomUUID()}`;
}

function findNode(board, nodeId) {
  return board.nodes.find((n) => n.id === nodeId);
}

/**
 * Add an Actor/Screen/Action/Outcome node to a slice. If `afterNodeId` is
 * given, also adds an edge from it to the new node (matches how the source
 * import data links elements in sequence).
 */
export function placeElement(board, { specId, sliceId, sliceType, laneId, label, afterNodeId }) {
  if (board.frozenSpecs?.[specId]) {
    throw new Error(
      `placeElement: specId "${specId}" is frozen (since ${board.frozenSpecs[specId].frozenAt}) — a frozen seed spec is immutable, see freezeSpec/Ouroboros discipline in ADR 0004`,
    );
  }
  if (!ELEMENT_LANES.includes(laneId)) {
    throw new Error(`placeElement: laneId must be one of ${ELEMENT_LANES.join(", ")}, got "${laneId}"`);
  }
  if (afterNodeId && !findNode(board, afterNodeId)) {
    throw new Error(`placeElement: afterNodeId "${afterNodeId}" does not exist on the board`);
  }

  const node = { id: newNodeId(specId), label, laneId, sliceId, sliceType, specId };
  board.nodes.push(node);
  if (afterNodeId) {
    board.edges.push({ source: afterNodeId, target: node.id });
  }
  return node;
}

/**
 * Add, rename, or reorder Action/Outcome nodes on the timeline.
 * - add: same as placeElement but restricted to action/outcome lanes.
 * - rename: change an existing node's label.
 * - reorder: move a node to appear immediately before another node in the
 *   board's node array (the array order is what the canvas renders left to
 *   right within a lane).
 */
export function editTimeline(board, params) {
  const { operation } = params;

  if (operation === "add") {
    const { laneId } = params;
    if (!TIMELINE_LANES.includes(laneId)) {
      throw new Error(`editTimeline add: laneId must be one of ${TIMELINE_LANES.join(", ")}, got "${laneId}"`);
    }
    return placeElement(board, params);
  }

  if (operation === "rename") {
    const { nodeId, newLabel } = params;
    const node = findNode(board, nodeId);
    if (!node) throw new Error(`editTimeline rename: no node with id "${nodeId}"`);
    node.label = newLabel;
    return node;
  }

  if (operation === "reorder") {
    const { nodeId, beforeNodeId } = params;
    const fromIndex = board.nodes.findIndex((n) => n.id === nodeId);
    const toIndex = board.nodes.findIndex((n) => n.id === beforeNodeId);
    if (fromIndex === -1) throw new Error(`editTimeline reorder: no node with id "${nodeId}"`);
    if (toIndex === -1) throw new Error(`editTimeline reorder: no node with id "${beforeNodeId}"`);
    const [node] = board.nodes.splice(fromIndex, 1);
    const insertAt = board.nodes.findIndex((n) => n.id === beforeNodeId);
    board.nodes.splice(insertAt, 0, node);
    return node;
  }

  throw new Error(`editTimeline: unknown operation "${operation}" (expected add, rename, or reorder)`);
}

function ensureSeedMap(board, sliceId) {
  board.seedExampleMaps ??= {};
  board.seedExampleMaps[sliceId] ??= { nodes: [], edges: [] };
  return board.seedExampleMaps[sliceId];
}

/**
 * Add or edit Rule/Example/Question cards on a slice's Layer 2 Example Map
 * (the only write target for Layer 2, since the MCP server has no access
 * to the browser localStorage the canvas itself writes to — see ADR 0003).
 */
export function editExampleMap(board, params) {
  const { sliceId, operation } = params;
  const map = ensureSeedMap(board, sliceId);

  if (operation === "add_rule") {
    const { label } = params;
    const node = { id: randomUUID(), data: { nodeType: "rule", label } };
    map.nodes.push(node);
    return node;
  }

  if (operation === "add_example") {
    const { ruleId, label, scenario } = params;
    if (ruleId && !map.nodes.some((n) => n.id === ruleId && n.data?.nodeType === "rule")) {
      throw new Error(`editExampleMap add_example: no rule card with id "${ruleId}" on slice "${sliceId}"`);
    }
    const node = { id: randomUUID(), data: { nodeType: "example", label, scenario } };
    map.nodes.push(node);
    if (ruleId) map.edges.push({ source: ruleId, target: node.id });
    return node;
  }

  if (operation === "add_question") {
    const { label, relatedNodeId } = params;
    if (relatedNodeId && !map.nodes.some((n) => n.id === relatedNodeId)) {
      throw new Error(`editExampleMap add_question: no card with id "${relatedNodeId}" on slice "${sliceId}"`);
    }
    const node = { id: randomUUID(), data: { nodeType: "question", label } };
    map.nodes.push(node);
    if (relatedNodeId) map.edges.push({ source: relatedNodeId, target: node.id });
    return node;
  }

  if (operation === "edit_card") {
    const { cardId, newLabel, newScenario } = params;
    const node = map.nodes.find((n) => n.id === cardId);
    if (!node) throw new Error(`editExampleMap edit_card: no card with id "${cardId}" on slice "${sliceId}"`);
    if (newLabel !== undefined) node.data.label = newLabel;
    if (newScenario !== undefined) node.data.scenario = newScenario;
    return node;
  }

  throw new Error(`editExampleMap: unknown operation "${operation}" (expected add_rule, add_example, add_question, or edit_card)`);
}

/**
 * Analysis-only data-continuity check for a slice's Example Map — never
 * mutates the board. Flags Examples missing a linked Rule, Examples with
 * an incomplete Given/When/Then scenario, and any unresolved Question
 * cards (PowerGym's own signal that a slice "isn't understood well enough"
 * yet, per the export_specifications tool's own doc comment).
 */
export function runWdyt(board, { sliceId }) {
  const map = board.seedExampleMaps?.[sliceId];
  if (!map) {
    return { sliceId, findings: [`No Example Map exists yet for slice "${sliceId}".`] };
  }

  const findings = [];
  const ruleIds = new Set(map.nodes.filter((n) => n.data?.nodeType === "rule").map((n) => n.id));
  const linkedExampleIds = new Set(map.edges.filter((e) => ruleIds.has(e.source)).map((e) => e.target));

  for (const node of map.nodes) {
    if (node.data?.nodeType !== "example") continue;
    if (!linkedExampleIds.has(node.id)) {
      findings.push(`Example "${node.data.label}" (${node.id}) has no linked Rule card.`);
    }
    const scenario = node.data.scenario ?? {};
    for (const field of ["given", "when", "then"]) {
      if (!scenario[field] || String(scenario[field]).trim().length === 0) {
        findings.push(`Example "${node.data.label}" (${node.id}) is missing "${field}" in its scenario.`);
      }
    }
  }

  for (const node of map.nodes) {
    if (node.data?.nodeType === "question") {
      findings.push(`Unresolved Question card: "${node.data.label}" (${node.id}).`);
    }
  }

  return { sliceId, findings };
}

/**
 * Freeze a specId, making it immutable to future `placeElement` calls —
 * Ouroboros' "immutable seed specs" discipline (docs/adr/0004): once a
 * generated board is accepted (its ambiguity score clears the gate, or a
 * human says so), locking it in stops a later Interview pass from quietly
 * rewriting already-accepted content. Deliberately idempotent-unsafe: a
 * second freeze on an already-frozen specId throws rather than silently
 * refreshing the timestamp, since re-freezing usually means the caller
 * lost track of state, not a legitimate re-confirmation.
 *
 * Scope, stated honestly: this guards `placeElement` (new-element
 * generation, the operation the Interview harness itself performs) only.
 * `editTimeline`/`editExampleMap` operate on already-placed nodes and are
 * not guarded here — a real, named gap, not an oversight; see ADR 0004.
 */
export function freezeSpec(board, { specId }) {
  board.frozenSpecs ??= {};
  if (board.frozenSpecs[specId]) {
    throw new Error(`freezeSpec: specId "${specId}" is already frozen (since ${board.frozenSpecs[specId].frozenAt})`);
  }
  const record = { frozenAt: new Date().toISOString() };
  board.frozenSpecs[specId] = record;
  return { specId, ...record };
}
