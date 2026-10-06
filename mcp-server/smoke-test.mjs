// Manual smoke test: spawns the MCP server as a child process and drives
// it over stdio JSON-RPC directly, without depending on any external
// harness being available to test against.
//
// Rewritten 2026-10-06 (docs/adr/0005): this repo stores no board of its
// own any more, so this test can't assume real PowerGym content is just
// sitting there. It seeds a small synthetic board itself, in a throwaway
// tmpdir pointed to via NOMOTHETES_BOARD_DIR, and tears the dir down at
// the end — same posture as every automated test in this repo, just not
// run through vitest (this one spawns a real child process over stdio).
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOARD_ID = "smoke-test";
const SPEC_ID = "smoke-spec";
const boardDir = mkdtempSync(join(tmpdir(), "nomothetes-smoke-test-"));
const BOARD_PATH = join(boardDir, `${BOARD_ID}-board.json`);

function synthetic() {
  const sliceId = "widget-creation";
  const actorId = `${SPEC_ID}:actor-1`;
  const screenId = `${SPEC_ID}:screen-1`;
  const actionId = `${SPEC_ID}:action-1`;
  const outcomeId = `${SPEC_ID}:outcome-1`;
  return {
    nodes: [
      { id: actorId, label: "Shopper", laneId: "actor", sliceId, sliceType: "command", specId: SPEC_ID },
      { id: screenId, label: "Widget Form", laneId: "screen", sliceId, sliceType: "command", specId: SPEC_ID },
      { id: actionId, label: "Create Widget", laneId: "action", sliceId, sliceType: "command", specId: SPEC_ID },
      { id: outcomeId, label: "WidgetCreated", laneId: "outcome", sliceId, sliceType: "command", specId: SPEC_ID },
    ],
    edges: [
      { id: "e1", source: actorId, target: screenId, label: "triggers" },
      { id: "e2", source: screenId, target: actionId, label: "triggers" },
      { id: "e3", source: actionId, target: outcomeId, label: "produces" },
    ],
    seedExampleMaps: {
      [sliceId]: {
        nodes: [
          { id: "rule-1", data: { nodeType: "rule", label: "A widget must have a non-empty name" } },
          {
            id: "example-1",
            data: {
              nodeType: "example",
              label: "Creating a widget with a name",
              scenario: { given: "no widget exists yet", when: "the shopper submits a name", then: "a WidgetCreated event is produced" },
            },
          },
        ],
        edges: [{ source: "rule-1", target: "example-1" }],
      },
    },
  };
}

writeFileSync(BOARD_PATH, JSON.stringify(synthetic(), null, 2));

const proc = spawn("node", [join(__dirname, "index.mjs")], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, NOMOTHETES_BOARD_DIR: boardDir },
});

let buffer = "";
const pending = new Map();
let nextId = 1;

proc.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});
proc.stderr.on("data", (chunk) => process.stderr.write(`[server stderr] ${chunk}`));

function send(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

function cleanup() {
  rmSync(boardDir, { recursive: true, force: true });
}

async function main() {
  const init = await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "0.0.1" },
  });
  console.log("=== initialize ===");
  console.log(JSON.stringify(init.result?.serverInfo, null, 2));
  proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const list = await send("tools/list", {});
  console.log("\n=== tools/list ===");
  console.log((list.result?.tools ?? []).map((t) => t.name));

  const arcs = await send("tools/call", { name: "list_story_arcs", arguments: { boardId: BOARD_ID } });
  console.log("\n=== list_story_arcs (first 200 chars) ===");
  console.log(arcs.result?.content?.[0]?.text?.slice(0, 200));

  const arc = await send("tools/call", { name: "get_story_arc", arguments: { boardId: BOARD_ID, specId: SPEC_ID } });
  const arcData = JSON.parse(arc.result?.content?.[0]?.text ?? "{}");
  console.log(`\n=== get_story_arc(${SPEC_ID}) ===`);
  console.log("nodes:", arcData.nodes?.length, "edges:", arcData.edges?.length);

  const badArc = await send("tools/call", { name: "get_story_arc", arguments: { boardId: BOARD_ID, specId: "does-not-exist" } });
  console.log("\n=== get_story_arc(does-not-exist) — expect isError ===");
  console.log("isError:", badArc.result?.isError, "text:", badArc.result?.content?.[0]?.text);

  const search = await send("tools/call", { name: "search_elements", arguments: { boardId: BOARD_ID, query: "widget" } });
  const searchResults = JSON.parse(search.result?.content?.[0]?.text ?? "[]");
  console.log("\n=== search_elements('widget') ===");
  console.log("matches:", searchResults.length, searchResults.slice(0, 3).map((n) => n.label));

  const slices = await send("tools/call", { name: "list_slices", arguments: { boardId: BOARD_ID, specId: SPEC_ID } });
  const sliceData = JSON.parse(slices.result?.content?.[0]?.text ?? "[]");
  console.log(`\n=== list_slices(${SPEC_ID}) ===`);
  console.log("count:", sliceData.length, "first:", JSON.stringify(sliceData[0]));
  const withMap = sliceData.find((s) => s.hasExampleMap);
  console.log("first with hasExampleMap:", withMap?.sliceId);

  if (withMap) {
    const em = await send("tools/call", { name: "get_example_map", arguments: { boardId: BOARD_ID, sliceId: withMap.sliceId } });
    const emData = JSON.parse(em.result?.content?.[0]?.text ?? "{}");
    console.log("\n=== get_example_map ===");
    console.log("nodes:", emData.nodes?.length, "edges:", emData.edges?.length, "nodeTypes:", emData.nodes?.map((n) => n.data?.nodeType));

    const specs = await send("tools/call", { name: "export_specifications", arguments: { boardId: BOARD_ID, sliceId: withMap.sliceId } });
    const specData = JSON.parse(specs.result?.content?.[0]?.text ?? "{}");
    console.log("\n=== export_specifications ===");
    console.log("specifications:", specData.specifications?.length, "warnings:", specData.warnings?.length);

    const rules = await send("tools/call", { name: "get_slice_rules", arguments: { boardId: BOARD_ID, sliceId: withMap.sliceId } });
    const rulesData = JSON.parse(rules.result?.content?.[0]?.text ?? "{}");
    console.log("\n=== get_slice_rules ===");
    console.log("rules:", rulesData.rules?.length, rulesData.rules?.map((r) => r.label.slice(0, 60)));

    const examples = await send("tools/call", { name: "get_slice_examples", arguments: { boardId: BOARD_ID, sliceId: withMap.sliceId } });
    const examplesData = JSON.parse(examples.result?.content?.[0]?.text ?? "{}");
    console.log("\n=== get_slice_examples ===");
    console.log("examples:", examplesData.examples?.length);
    examplesData.examples?.forEach((ex, i) => console.log(`  ${i}: ${ex.label} — Given: ${ex.scenario?.given?.slice(0, 40)}...`));

    const badRules = await send("tools/call", { name: "get_slice_rules", arguments: { boardId: BOARD_ID, sliceId: "does-not-exist" } });
    console.log("\n=== get_slice_rules(does-not-exist) — expect isError ===");
    console.log("isError:", badRules.result?.isError);
  }

  const badMap = await send("tools/call", { name: "get_example_map", arguments: { boardId: BOARD_ID, sliceId: "does-not-exist" } });
  console.log("\n=== get_example_map(does-not-exist) — expect isError ===");
  console.log("isError:", badMap.result?.isError);

  // Agentic Modeling write tools (v3) — real round-trip against the actual
  // board file on disk. Each call now re-reads the board fresh per
  // docs/adr/0005's v4 change, but reading directly from disk here still
  // proves the write landed independent of the read path's own logic.
  const beforeRaw = readFileSync(BOARD_PATH, "utf-8");

  const placed = await send("tools/call", {
    name: "place_element",
    arguments: { boardId: BOARD_ID, specId: SPEC_ID, sliceId: "smoke-test-slice", sliceType: "command", laneId: "actor", label: "Smoke Test Actor" },
  });
  const placedNode = JSON.parse(placed.result?.content?.[0]?.text ?? "{}");
  console.log("\n=== place_element ===");
  console.log("new node id:", placedNode.id);

  const afterPlaceOnDisk = JSON.parse(readFileSync(BOARD_PATH, "utf-8"));
  console.log("\n=== disk check after place_element — expect the new node present ===");
  console.log("found on disk:", afterPlaceOnDisk.nodes.some((n) => n.id === placedNode.id));

  const addedExample = await send("tools/call", {
    name: "edit_example_map",
    arguments: {
      boardId: BOARD_ID,
      sliceId: "smoke-test-slice",
      operation: "add_example",
      label: "Smoke test example",
      scenario: { given: "a", when: "b", then: "c" },
    },
  });
  const addedExampleData = JSON.parse(addedExample.result?.content?.[0]?.text ?? "{}");
  console.log("\n=== edit_example_map add_example ===");
  console.log("new card id:", addedExampleData.id);

  const afterEditOnDisk = JSON.parse(readFileSync(BOARD_PATH, "utf-8"));
  const smokeMapOnDisk = afterEditOnDisk.seedExampleMaps?.["smoke-test-slice"];
  console.log("\n=== disk check after edit_example_map — expect 1 node in seedExampleMaps['smoke-test-slice'] ===");
  console.log("nodes on disk:", smokeMapOnDisk?.nodes?.length);

  const beforeWdytRaw = readFileSync(BOARD_PATH, "utf-8");
  const wdytFindings = await send("tools/call", { name: "run_wdyt", arguments: { boardId: BOARD_ID, sliceId: "smoke-test-slice" } });
  const wdytData = JSON.parse(wdytFindings.result?.content?.[0]?.text ?? "{}");
  console.log("\n=== run_wdyt(smoke-test-slice) — expect a 'no linked Rule card' finding ===");
  console.log("findings:", wdytData.findings);

  const afterWdytRaw = readFileSync(BOARD_PATH, "utf-8");
  console.log("\n=== run_wdyt mutation check — file must be byte-identical to before the call ===");
  console.log("unchanged:", afterWdytRaw === beforeWdytRaw);

  console.log("\n=== restoring board file to its pre-smoke-test state ===");
  writeFileSync(BOARD_PATH, beforeRaw);
  console.log("restored:", readFileSync(BOARD_PATH, "utf-8") === beforeRaw);

  proc.kill();
  cleanup();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  proc.kill();
  cleanup();
  process.exit(1);
});
