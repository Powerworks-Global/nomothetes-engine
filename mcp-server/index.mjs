#!/usr/bin/env node
// MCP server exposing Nomothetes's board data (currently PowerGym's imported
// eventmodelers.ai story-arcs) to any MCP-compatible harness.
//
// Design note (Ouroboros-inspired reframe, decided 2026-09-02): rather than
// hand-building a per-harness export adapter, expose the board through one
// protocol every major harness already speaks. The canonical data stays the
// same JSON schema the import adapter and the React app both already use
// (src/data/powergym-board.json) — this server is a thin protocol wrapper
// around it, not a second source of truth.
//
// v2 (2026-09-14) adds the verification-spine surface: slice listing,
// Layer 2 Example Maps, and the specifications[] export (WS3).
//
// v3 (2026-09-23) adds Agentic Modeling's write tools (place_element,
// edit_timeline, edit_example_map, run_wdyt). Unlike every tool above,
// which reads the module-level `board` const loaded once at startup, the
// write tools re-read the board file fresh on every call via
// board-store.mjs — see docs/adr/0003-agentic-modeling-write-path.md for
// why writes target the committed JSON file directly.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { exportSpecifications } from "../scripts/export-specifications.mjs";
import { readBoard, writeBoard, boardPathFor, withBoardLock } from "./board-store.mjs";
import { editExampleMap, editTimeline, freezeSpec, placeElement, runWdyt } from "./board-mutations.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const board = JSON.parse(readFileSync(join(__dirname, "..", "src", "data", "powergym-board.json"), "utf-8"));

function specIds() {
  const seen = new Set();
  const order = [];
  for (const n of board.nodes) {
    if (!seen.has(n.specId)) {
      seen.add(n.specId);
      order.push(n.specId);
    }
  }
  return order;
}

/** Slices for one spec (or every spec when specId is omitted), in order of
 * first appearance, labeled by their Screen node when present — the source
 * board carries no separate slice title field (same logic as loadBoard.ts). */
function slices(specId) {
  const byId = new Map();
  const order = [];
  for (const n of board.nodes) {
    if (specId && n.specId !== specId) continue;
    if (!byId.has(n.sliceId)) {
      byId.set(n.sliceId, { sliceId: n.sliceId, specId: n.specId, sliceType: n.sliceType, label: n.label });
      order.push(n.sliceId);
    }
    if (n.laneId === "screen") byId.get(n.sliceId).label = n.label;
  }
  return order.map((id) => {
    const s = byId.get(id);
    return {
      sliceId: s.sliceId,
      specId: s.specId,
      sliceType: s.sliceType,
      label: s.label,
      hasExampleMap: Boolean(board.seedExampleMaps?.[id]),
    };
  });
}

const server = new McpServer({ name: "nomothetes", version: "0.2.0" });

server.tool(
  "list_story_arcs",
  "List every story-arc (spec) currently on the board, with node/edge counts. Use this before get_story_arc to see what's available.",
  {},
  async () => {
    const arcs = specIds().map((specId) => {
      const nodes = board.nodes.filter((n) => n.specId === specId);
      const edges = board.edges.filter(
        (e) => nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target),
      );
      return { specId, nodeCount: nodes.length, edgeCount: edges.length };
    });
    return { content: [{ type: "text", text: JSON.stringify(arcs, null, 2) }] };
  },
);

server.tool(
  "get_story_arc",
  "Get the full nodes and edges for one story-arc, in the canvas's own node/edge schema (id, label, laneId, sliceId, sliceType for nodes; source, target, label for edges). laneId is one of actor/screen/action/outcome/ownedData.",
  { specId: z.string().describe("A story-arc id from list_story_arcs, e.g. '002a-member-registration'") },
  async ({ specId }) => {
    const nodes = board.nodes.filter((n) => n.specId === specId);
    if (nodes.length === 0) {
      return {
        content: [{ type: "text", text: `No story-arc found with id "${specId}". Call list_story_arcs to see valid ids.` }],
        isError: true,
      };
    }
    const edges = board.edges.filter(
      (e) => nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target),
    );
    return { content: [{ type: "text", text: JSON.stringify({ nodes, edges }, null, 2) }] };
  },
);

server.tool(
  "search_elements",
  "Search across every story-arc for nodes whose label contains the query (case-insensitive substring match). Use this to find which slice/story-arc handles a given concept without knowing the specId up front.",
  { query: z.string().min(1) },
  async ({ query }) => {
    const q = query.toLowerCase();
    const matches = board.nodes.filter((n) => n.label.toLowerCase().includes(q));
    return { content: [{ type: "text", text: JSON.stringify(matches, null, 2) }] };
  },
);

server.tool(
  "list_slices",
  "List slices (vertical buildable units), optionally filtered to one story-arc. Each entry has sliceId, specId, sliceType, a human label, and hasExampleMap (whether a Layer 2 Example Map was seeded from the source). Use this before get_example_map or export_specifications.",
  { specId: z.string().optional().describe("Optional story-arc id to filter by; omit to list every slice on the board.") },
  async ({ specId }) => {
    return { content: [{ type: "text", text: JSON.stringify(slices(specId), null, 2) }] };
  },
);

server.tool(
  "get_example_map",
  "Get a slice's Layer 2 Example Map (Rule/Example/Question cards, each Example carrying a Given/When/Then scenario) as nodes/edges. Only slices whose source had Functional Requirements/Acceptance Criteria have a seed map (see hasExampleMap in list_slices).",
  { sliceId: z.string().describe("A slice id from list_slices, e.g. a uuid.") },
  async ({ sliceId }) => {
    const seed = board.seedExampleMaps?.[sliceId];
    if (!seed) {
      return {
        content: [{ type: "text", text: `No seed Example Map for slice "${sliceId}". Only slices whose source spec had Functional Requirements + Acceptance Criteria get one — check list_slices (hasExampleMap) for which do.` }],
        isError: true,
      };
    }
    return { content: [{ type: "text", text: JSON.stringify(seed, null, 2) }] };
  },
);

server.tool(
  "export_specifications",
  "Turn a slice's Example Map into a specifications[] array (the shape downstream test-generation consumes: one spec per Example, with the Rule's text carried on each). Refuses if the map has unresolved Question cards — that's the 'slice isn't understood well enough' signal.",
  { sliceId: z.string().describe("A slice id from list_slices that has hasExampleMap true.") },
  async ({ sliceId }) => {
    const seed = board.seedExampleMaps?.[sliceId];
    if (!seed) {
      return {
        content: [{ type: "text", text: `No seed Example Map for slice "${sliceId}" — call list_slices to find one with hasExampleMap true.` }],
        isError: true,
      };
    }
    try {
      const result = exportSpecifications(seed, sliceId);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
  },
);

server.tool(
  "get_slice_rules",
  "Get only the Rule cards (Yellow) from a slice's Example Map — the business rules/policies that govern the slice's behavior. Returns an array of { id, label } for each Rule. Use this when you only need the rule statements, not the full Example Map.",
  { sliceId: z.string().describe("A slice id from list_slices that has hasExampleMap true.") },
  async ({ sliceId }) => {
    const seed = board.seedExampleMaps?.[sliceId];
    if (!seed) {
      return {
        content: [{ type: "text", text: `No seed Example Map for slice "${sliceId}" — call list_slices to find one with hasExampleMap true.` }],
        isError: true,
      };
    }
    const rules = seed.nodes
      .filter((n) => n.data?.nodeType === "rule")
      .map((n) => ({ id: n.id, label: n.data.label }));
    return { content: [{ type: "text", text: JSON.stringify({ sliceId, rules }, null, 2) }] };
  },
);

server.tool(
  "get_slice_examples",
  "Get only the Example cards (Green) from a slice's Example Map — each with its Given/When/Then scenario. Returns an array of { id, label, scenario: { given, when, then }, ruleLabel }. Use this when you need the concrete test cases without the Question cards or graph edges.",
  { sliceId: z.string().describe("A slice id from list_slices that has hasExampleMap true.") },
  async ({ sliceId }) => {
    const seed = board.seedExampleMaps?.[sliceId];
    if (!seed) {
      return {
        content: [{ type: "text", text: `No seed Example Map for slice "${sliceId}" — call list_slices to find one with hasExampleMap true.` }],
        isError: true,
      };
    }
    const ruleById = new Map(seed.nodes.filter((n) => n.data?.nodeType === "rule").map((n) => [n.id, n.data.label]));
    const ruleByExampleId = new Map();
    for (const edge of seed.edges) {
      const rule = ruleById.get(edge.source);
      if (rule) ruleByExampleId.set(edge.target, rule);
    }
    const examples = seed.nodes
      .filter((n) => n.data?.nodeType === "example")
      .map((n) => ({
        id: n.id,
        label: n.data.label,
        scenario: n.data.scenario,
        ruleLabel: ruleByExampleId.get(n.id) ?? null,
      }));
    return { content: [{ type: "text", text: JSON.stringify({ sliceId, examples }, null, 2) }] };
  },
);

server.tool(
  "place_element",
  "Add an Actor/Screen/Action/Outcome/ownedData node to the board. Writes directly to the committed board JSON (see ADR 0003) — not the read-only in-memory snapshot the other tools use. Optionally links it from an existing node via afterNodeId. Rejects if specId is frozen (see freeze_spec).",
  {
    specId: z.string().describe("The story-arc id this node belongs to."),
    sliceId: z.string().describe("The slice id this node belongs to."),
    sliceType: z.string().describe("The slice's type, e.g. 'command' or 'query' (matches the slice's existing sliceType)."),
    laneId: z.enum(["actor", "screen", "action", "outcome", "ownedData"]),
    label: z.string().min(1),
    afterNodeId: z.string().optional().describe("If given, an edge is added from this existing node to the new one."),
    boardId: z.string().optional().describe("Which board to write to (defaults to PowerGym's board — see docs/adr/0004-interview-harness.md)."),
  },
  async ({ boardId, ...params }) => {
    try {
      const path = boardPathFor(boardId);
      const node = withBoardLock(path, () => {
        const board = readBoard(path);
        const n = placeElement(board, params);
        writeBoard(board, path);
        return n;
      });
      return { content: [{ type: "text", text: JSON.stringify(node, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
  },
);

server.tool(
  "edit_timeline",
  "Add, rename, or reorder Action/Outcome nodes. operation='add' (needs specId/sliceId/sliceType/laneId[action|outcome]/label, optional afterNodeId), 'rename' (needs nodeId/newLabel), or 'reorder' (needs nodeId/beforeNodeId — moves nodeId to appear immediately before beforeNodeId).",
  {
    operation: z.enum(["add", "rename", "reorder"]),
    specId: z.string().optional(),
    sliceId: z.string().optional(),
    sliceType: z.string().optional(),
    laneId: z.enum(["action", "outcome"]).optional(),
    label: z.string().optional(),
    afterNodeId: z.string().optional(),
    nodeId: z.string().optional(),
    newLabel: z.string().optional(),
    beforeNodeId: z.string().optional(),
    boardId: z.string().optional().describe("Which board to write to (defaults to PowerGym's board)."),
  },
  async ({ boardId, ...params }) => {
    try {
      const path = boardPathFor(boardId);
      const node = withBoardLock(path, () => {
        const board = readBoard(path);
        const n = editTimeline(board, params);
        writeBoard(board, path);
        return n;
      });
      return { content: [{ type: "text", text: JSON.stringify(node, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
  },
);

server.tool(
  "edit_example_map",
  "Add or edit Rule/Example/Question cards on a slice's Layer 2 Example Map (seedExampleMaps in the board JSON — the only write target for Layer 2, since the MCP server can't reach browser localStorage; see ADR 0003). operation='add_rule' (label), 'add_example' (label, scenario {given,when,then}, optional ruleId to link), 'add_question' (label, optional relatedNodeId to link), or 'edit_card' (cardId, optional newLabel/newScenario).",
  {
    sliceId: z.string(),
    operation: z.enum(["add_rule", "add_example", "add_question", "edit_card"]),
    label: z.string().optional(),
    ruleId: z.string().optional(),
    scenario: z.object({ given: z.string(), when: z.string(), then: z.string() }).optional(),
    relatedNodeId: z.string().optional(),
    cardId: z.string().optional(),
    newLabel: z.string().optional(),
    newScenario: z.object({ given: z.string(), when: z.string(), then: z.string() }).optional(),
    boardId: z.string().optional().describe("Which board to write to (defaults to PowerGym's board)."),
  },
  async ({ boardId, ...params }) => {
    try {
      const path = boardPathFor(boardId);
      const card = withBoardLock(path, () => {
        const board = readBoard(path);
        const c = editExampleMap(board, params);
        writeBoard(board, path);
        return c;
      });
      return { content: [{ type: "text", text: JSON.stringify(card, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
  },
);

server.tool(
  "run_wdyt",
  "Analysis-only data-continuity check for a slice's Example Map: flags Examples with no linked Rule, Examples with an incomplete Given/When/Then scenario, and any unresolved Question cards. Never mutates the board — read-only, matches PowerGym's own /wdyt convention.",
  {
    sliceId: z.string().describe("A slice id from list_slices."),
    boardId: z.string().optional().describe("Which board to read (defaults to PowerGym's board)."),
  },
  async ({ sliceId, boardId }) => {
    const board = readBoard(boardPathFor(boardId));
    const result = runWdyt(board, { sliceId });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.tool(
  "freeze_spec",
  "Freeze a specId, making it immutable to future place_element calls — Ouroboros' immutable-seed-specs discipline (docs/adr/0004-interview-harness.md). Throws if already frozen. Does not guard edit_timeline/edit_example_map — a stated scope limit, not an oversight.",
  {
    specId: z.string().describe("The story-arc id to freeze."),
    boardId: z.string().optional().describe("Which board to write to (defaults to PowerGym's board)."),
  },
  async ({ specId, boardId }) => {
    try {
      const path = boardPathFor(boardId);
      const result = withBoardLock(path, () => {
        const board = readBoard(path);
        const r = freezeSpec(board, { specId });
        writeBoard(board, path);
        return r;
      });
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: err.message }], isError: true };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
