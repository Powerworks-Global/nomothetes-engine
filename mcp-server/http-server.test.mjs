import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// The self-host quickstart's MCP endpoint, driven over real HTTP by a real
// JSON-RPC client (fetch) — the same thing a stranger's `curl` in the README,
// or an MCP client pointed at http://localhost:3001/mcp, actually does. stdio
// has smoke-test.mjs; without this file, the HTTP transport the quickstart
// ships would be covered by nothing.
//
// The server runs as a subprocess rather than in-process: it must be started
// with its own NOMOTHETES_BOARD_DIR (a temp dir, never a real board), exactly
// as docker-compose.yml starts it.

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

/** Every tool the board surface is supposed to expose — the list a harness or
 * ADR 0003's write-path review would expect. Asserted against what the HTTP
 * transport actually returns, so a transport that registers its own smaller or
 * drifted copy of the tools fails here. */
const EXPECTED_TOOLS = [
  "edit_example_map",
  "edit_timeline",
  "export_specifications",
  "freeze_spec",
  "get_example_map",
  "get_slice_examples",
  "get_slice_rules",
  "get_story_arc",
  "list_slices",
  "list_story_arcs",
  "place_element",
  "run_wdyt",
  "search_elements",
];

let dir;
let child;
let baseUrl;
let sessionId;

/** Streamable HTTP answers JSON-RPC as an SSE body (`event: message` +
 * `data: {...}`) even for a single request/response — unwrap it. */
function parseRpc(body) {
  const dataLine = body.split("\n").find((l) => l.startsWith("data: "));
  if (!dataLine) throw new Error(`no JSON-RPC data line in response:\n${body}`);
  return JSON.parse(dataLine.slice("data: ".length));
}

async function rpc(method, params = {}, { session = true, id = 1 } = {}) {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(session && sessionId ? { "mcp-session-id": sessionId } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  return { status: res.status, headers: res.headers, body: parseRpc(await res.text()) };
}

/** tools/call for one named tool — the shape a harness actually sends (the
 * tool name is a parameter of tools/call, not a JSON-RPC method of its own;
 * sending it as a method is the "not found this tool" class of bug). */
async function callTool(name, args, id = 2) {
  return rpc("tools/call", { name, arguments: args }, { id });
}

/** First text block of a tool result, parsed as JSON where the tool returns
 * JSON (every board tool does). */
function toolJson(body) {
  if (body.error) throw new Error(`JSON-RPC error: ${JSON.stringify(body.error)}`);
  if (body.result.isError) throw new Error(`tool error: ${body.result.content[0].text}`);
  return JSON.parse(body.result.content[0].text);
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "http-mcp-"));
  writeFileSync(
    join(dir, "testboard-board.json"),
    JSON.stringify({
      nodes: [{ id: "n1", specId: "spec-a", sliceId: "slice-1", sliceType: "command", laneId: "screen", label: "Test Screen" }],
      edges: [],
      seedExampleMaps: {},
    }),
  );

  child = spawn(process.execPath, [join(repoRoot, "mcp-server", "http-server.mjs")], {
    cwd: repoRoot,
    env: { ...process.env, NOMOTHETES_BOARD_DIR: dir, MCP_HOST: "127.0.0.1", MCP_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const port = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error("MCP HTTP server did not report its port within 10s")), 10_000);
    child.stdout.on("data", (chunk) => {
      const match = /listening on http:\/\/[\d.]+:(\d+)/.exec(chunk.toString());
      if (match) {
        clearTimeout(timer);
        done(Number(match[1]));
      }
    });
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.on("exit", (code) => fail(new Error(`MCP HTTP server exited early (code ${code})`)));
  });
  baseUrl = `http://127.0.0.1:${port}`;

  const init = await rpc(
    "initialize",
    { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "vitest", version: "0" } },
    { session: false },
  );
  sessionId = init.headers.get("mcp-session-id");

  // The handshake is initialize → notifications/initialized → requests. Skip
  // the notification and the server answers tools/call with "Server not
  // initialized" — which is why it's part of the fixture here (and part of the
  // README's curl sequence) rather than an assumption.
  await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-session-id": sessionId,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
});

afterAll(() => {
  child?.kill("SIGTERM");
  rmSync(dir, { recursive: true, force: true });
});

describe("MCP over Streamable HTTP", () => {
  it("completes the initialize handshake and names itself", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(await res.json()).toMatchObject({ status: "ok", server: "nomothetes" });
    expect(sessionId, "initialize must return an Mcp-Session-Id").toBeTruthy();
  });

  it("serves exactly the tool surface tools.mjs registers - no drift", async () => {
    const { body } = await rpc("tools/list", {});
    const names = body.result.tools.map((t) => t.name).sort();
    expect(names).toEqual(EXPECTED_TOOLS);
  });

  it("refuses a request that carries no session id", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("reads the board through the same read path stdio uses", async () => {
    const { body } = await callTool("list_story_arcs", { boardId: "testboard" });
    expect(toolJson(body)).toEqual([{ specId: "spec-a", nodeCount: 1, edgeCount: 0 }]);
  });

  it("writes through the board lock and the write is on disk afterwards", async () => {
    const { body } = await callTool("place_element", {
      boardId: "testboard",
      specId: "spec-a",
      sliceId: "slice-1",
      sliceType: "command",
      laneId: "action",
      label: "Do The Thing",
      afterNodeId: "n1",
    });
    const placed = toolJson(body);
    expect(placed.label).toBe("Do The Thing");

    // Read the file directly: proof the write reached the volume the canvas
    // and the restart both read, not just an in-memory copy.
    const onDisk = JSON.parse(readFileSync(join(dir, "testboard-board.json"), "utf-8"));
    expect(onDisk.nodes.map((n) => n.label)).toContain("Do The Thing");
    expect(onDisk.edges.length).toBe(1);
  });

  it("names the board it can't find instead of inventing one (ADR 0005)", async () => {
    const { body } = await callTool("get_story_arc", { boardId: "testboard", specId: "no-such-spec" });
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0].text).toMatch(/No story-arc found/);
  });
});
