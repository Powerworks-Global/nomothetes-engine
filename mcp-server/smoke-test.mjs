// Manual smoke test: spawns the MCP server as a child process and drives
// it over stdio JSON-RPC directly, without depending on any external
// harness being available to test against.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BOARD_PATH = join(__dirname, "..", "src", "data", "powergym-board.json");
const proc = spawn("node", [join(__dirname, "index.mjs")], { stdio: ["pipe", "pipe", "pipe"] });

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

  const arcs = await send("tools/call", { name: "list_story_arcs", arguments: {} });
  console.log("\n=== list_story_arcs (first 200 chars) ===");
  console.log(arcs.result?.content?.[0]?.text?.slice(0, 200));

  const arc = await send("tools/call", { name: "get_story_arc", arguments: { specId: "002a-member-registration" } });
  const arcData = JSON.parse(arc.result?.content?.[0]?.text ?? "{}");
  console.log("\n=== get_story_arc(002a-member-registration) ===");
  console.log("nodes:", arcData.nodes?.length, "edges:", arcData.edges?.length);

  const badArc = await send("tools/call", { name: "get_story_arc", arguments: { specId: "does-not-exist" } });
  console.log("\n=== get_story_arc(does-not-exist) — expect isError ===");
  console.log("isError:", badArc.result?.isError, "text:", badArc.result?.content?.[0]?.text);

  const search = await send("tools/call", { name: "search_elements", arguments: { query: "membership" } });
  const searchResults = JSON.parse(search.result?.content?.[0]?.text ?? "[]");
  console.log("\n=== search_elements('membership') ===");
  console.log("matches:", searchResults.length, searchResults.slice(0, 3).map((n) => n.label));

  const slices = await send("tools/call", { name: "list_slices", arguments: { specId: "002a-member-registration" } });
  const sliceData = JSON.parse(slices.result?.content?.[0]?.text ?? "[]");
  console.log("\n=== list_slices(002a-member-registration) ===");
  console.log("count:", sliceData.length, "first:", JSON.stringify(sliceData[0]));
  const withMap = sliceData.find((s) => s.hasExampleMap);
  console.log("first with hasExampleMap:", withMap?.sliceId);

  if (withMap) {
    const em = await send("tools/call", { name: "get_example_map", arguments: { sliceId: withMap.sliceId } });
    const emData = JSON.parse(em.result?.content?.[0]?.text ?? "{}");
    console.log("\n=== get_example_map ===");
    console.log("nodes:", emData.nodes?.length, "edges:", emData.edges?.length, "nodeTypes:", emData.nodes?.map((n) => n.data?.nodeType));

    const specs = await send("tools/call", { name: "export_specifications", arguments: { sliceId: withMap.sliceId } });
    const specData = JSON.parse(specs.result?.content?.[0]?.text ?? "{}");
    console.log("\n=== export_specifications ===");
    console.log("specifications:", specData.specifications?.length, "warnings:", specData.warnings?.length);

    const rules = await send("tools/call", { name: "get_slice_rules", arguments: { sliceId: withMap.sliceId } });
    const rulesData = JSON.parse(rules.result?.content?.[0]?.text ?? "{}");
    console.log("\n=== get_slice_rules ===");
    console.log("rules:", rulesData.rules?.length, rulesData.rules?.map((r) => r.label.slice(0, 60)));

    const examples = await send("tools/call", { name: "get_slice_examples", arguments: { sliceId: withMap.sliceId } });
    const examplesData = JSON.parse(examples.result?.content?.[0]?.text ?? "{}");
    console.log("\n=== get_slice_examples ===");
    console.log("examples:", examplesData.examples?.length);
    examplesData.examples?.forEach((ex, i) => console.log(`  ${i}: ${ex.label} — Given: ${ex.scenario?.given?.slice(0, 40)}...`));

    const badRules = await send("tools/call", { name: "get_slice_rules", arguments: { sliceId: "does-not-exist" } });
    console.log("\n=== get_slice_rules(does-not-exist) — expect isError ===");
    console.log("isError:", badRules.result?.isError);
  }

  const badMap = await send("tools/call", { name: "get_example_map", arguments: { sliceId: "does-not-exist" } });
  console.log("\n=== get_example_map(does-not-exist) — expect isError ===");
  console.log("isError:", badMap.result?.isError);

  // Agentic Modeling write tools (v3) — real round-trip against the actual
  // board file on disk. Verified by reading the file directly with fs,
  // NOT via the read-only tools above (list_slices/search_elements/etc.):
  // those load `board` once at server startup and stay stale for the rest
  // of this process's life by design (see docs/adr/0003) — re-reading
  // them here would prove nothing about whether the write tools work.
  const beforeRaw = readFileSync(BOARD_PATH, "utf-8");

  const placed = await send("tools/call", {
    name: "place_element",
    arguments: { specId: "002a-member-registration", sliceId: "smoke-test-slice", sliceType: "command", laneId: "actor", label: "Smoke Test Actor" },
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
  const wdytFindings = await send("tools/call", { name: "run_wdyt", arguments: { sliceId: "smoke-test-slice" } });
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
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  proc.kill();
  process.exit(1);
});
