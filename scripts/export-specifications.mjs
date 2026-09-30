#!/usr/bin/env node
// Export adapter: the reverse of import-eventmodelers.mjs. Turns one slice's
// Layer 2 Example Map (this app's own exampleMapStore.ts board shape) into a
// `specifications[]` array in the shape a downstream test-generation
// harness's build-state-change/build-state-view skills consume from a real,
// board-fetched slice.json (see WS3.1's contract note for the full writeup).
//
// KNOWN, DELIBERATE SCHEMA DEVIATION — read before wiring this into anything
// downstream: a real slice.json's specifications[].given/when/then are
// ARRAYS OF SYMBOLIC EVENT/COMMAND NAMES (e.g. "given": ["SomeDomainEvent"]),
// not prose — confirmed against a real board-fetched example from a sibling
// project's own event-sourced codebase. This exporter's source data (the
// Example Map) has no model of named domain events/commands to draw
// symbolic references from — that's Layer 1's job, deliberately decoupled
// from Layer 2 in this app's current code — so given/when/then stay PROSE
// STRINGS here, not symbol arrays. Anything consuming this output for real
// needs to account for that gap; it is not resolved by this script.
//
// Also known, stated gap: there is no existing mapping between this app's
// PowerGym-sourced sliceIds and a downstream harness's own board ids —
// different products, different boards. The --slice-id passed here is NOT
// looked up or validated against any board; the caller is responsible for
// choosing one that means something on the downstream side and for
// authoring the Example Map itself under that same id in this app.
//
// Source shape (exampleMapStore.ts's ExampleMapBoard, exported to a file
// via the "Export Board JSON" button in ExampleMapView.tsx, or hand-built —
// see scripts/fixtures/ for an example):
//   { nodes: Node[], edges: Edge[] }
//   Node.data: { nodeType: "rule"|"example"|"question", label: string,
//                scenario?: { given, when, then } }  // "example" only
//   Edge: { source: <rule node id>, target: <example|question node id> }
//
// Usage: node scripts/export-specifications.mjs --input <board.json> --slice-id <id> > specifications.json

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadResolvedPresets } from "./presets.mjs";

function parseArgs(argv) {
  const args = { input: null, sliceId: null, presets: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.input = argv[++i];
    else if (argv[i] === "--slice-id") args.sliceId = argv[++i];
    else if (argv[i] === "--presets") args.presets = argv[++i];
  }
  return args;
}

/**
 * @param {{ nodes: any[], edges: any[] }} board
 * @param {string} sliceId
 * @returns {{ sliceId: string, specifications: object[], warnings: string[] }}
 */
export function exportSpecifications(board, sliceId) {
  const { nodes, edges } = board;

  const questionNodes = nodes.filter((n) => n.data?.nodeType === "question");
  if (questionNodes.length > 0) {
    const err = new Error(
      `Refusing to export: ${questionNodes.length} unresolved Question(s) present on this Example Map — resolve or remove them first.\n` +
        questionNodes.map((n) => `  - ${n.data.label}`).join("\n"),
    );
    err.isRefusal = true;
    throw err;
  }

  const ruleById = new Map(nodes.filter((n) => n.data?.nodeType === "rule").map((n) => [n.id, n]));
  const ruleLabelByExampleId = new Map();
  const exampleCountByRuleId = new Map();
  for (const edge of edges) {
    const rule = ruleById.get(edge.source);
    if (!rule) continue;
    const child = nodes.find((n) => n.id === edge.target);
    if (child?.data?.nodeType === "example") {
      ruleLabelByExampleId.set(child.id, rule.data.label);
      exampleCountByRuleId.set(rule.id, (exampleCountByRuleId.get(rule.id) ?? 0) + 1);
    }
  }

  const warnings = [];
  const specifications = [];
  let n = 0;
  for (const node of nodes) {
    if (node.data?.nodeType !== "example") continue;
    if (!node.data.scenario) {
      warnings.push(`Example "${node.data.label}" (${node.id}) has no scenario — skipped.`);
      continue;
    }
    n += 1;
    const spec = {
      id: `spec-${n}`,
      title: node.data.label,
      given: node.data.scenario.given,
      when: node.data.scenario.when,
      then: node.data.scenario.then,
      sourceExampleId: node.id,
    };
    const rule = ruleLabelByExampleId.get(node.id);
    if (rule) spec.rule = rule;
    specifications.push(spec);
  }

  for (const [ruleId, rule] of ruleById) {
    if (!exampleCountByRuleId.get(ruleId)) {
      warnings.push(`Rule "${rule.data.label}" (${ruleId}) has no attached Examples.`);
    }
  }

  return { sliceId, specifications, warnings };
}

// --- CLI wrapper -------------------------------------------------------------
// Guarded so this module can also be imported (the MCP server reuses
// exportSpecifications directly) without the CLI block running as a side
// effect. `isMain` is the standard "was this file run as the entry point"
// check for ESM.

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.sliceId) {
    console.error("Usage: node export-specifications.mjs --input <board.json> --slice-id <id> [--presets <file>]");
    process.exit(1);
  }

  const board = JSON.parse(readFileSync(args.input, "utf8"));

  let result;
  try {
    result = exportSpecifications(board, args.sliceId);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  // Presets (Phase 4): attach the resolved target stack + test framework as
  // metadata so a downstream agent knows what to generate. Backward-compatible
  // extra fields; the specifications[] array itself is unchanged.
  if (args.presets) {
    try {
      const presets = loadResolvedPresets(args.presets);
      result.targetStack = presets["integration.targetStack"];
      result.framework = presets["testing.framework"];
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  for (const w of result.warnings) console.error(`[warn] ${w}`);
  console.log(JSON.stringify(result, null, 2));
}
