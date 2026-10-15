import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createQuickstartServer } from "./selfhost-server.mjs";

// The quickstart's web server, tested for the two jobs that make the
// quickstart true: serving the built canvas, and serving the board volume as
// a live read (which is what lets an MCP write show up in the canvas, and what
// makes a restart's persistence observable at all).

let distDir;
let boardDir;
let server;
let baseUrl;

function writeBoard(id, board) {
  writeFileSync(join(boardDir, `${id}-board.json`), JSON.stringify(board));
}

const board = (label) => ({
  nodes: [{ id: "n1", specId: "spec-a", sliceId: "slice-1", sliceType: "command", laneId: "screen", label }],
  edges: [],
  seedExampleMaps: {},
});

beforeAll(async () => {
  distDir = mkdtempSync(join(tmpdir(), "quickstart-dist-"));
  boardDir = mkdtempSync(join(tmpdir(), "quickstart-boards-"));
  mkdirSync(join(distDir, "assets"), { recursive: true });
  writeFileSync(join(distDir, "index.html"), "<!doctype html><title>canvas</title>");
  writeFileSync(join(distDir, "assets", "index-abc123.js"), "console.log(1)");
  writeBoard("alpha", board("Alpha Screen"));

  server = createQuickstartServer({ distDir, boardDir });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
  server?.close();
  rmSync(distDir, { recursive: true, force: true });
  rmSync(boardDir, { recursive: true, force: true });
});

describe("board endpoints", () => {
  it("lists the boards on the volume with counts read from the files", async () => {
    const res = await fetch(`${baseUrl}/boards`);
    expect(await res.json()).toEqual({ boards: [{ id: "alpha", specCount: 1, nodeCount: 1, edgeCount: 0 }] });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("serves a board as the JSON on disk", async () => {
    const res = await fetch(`${baseUrl}/boards/alpha-board.json`);
    expect(res.status).toBe(200);
    expect((await res.json()).nodes[0].label).toBe("Alpha Screen");
  });

  it("re-reads the file on every request, so a write through another process shows up", async () => {
    // Simulates the MCP server writing between two canvas loads: nothing here
    // holds an open handle or a cache, so the second GET must see it.
    writeBoard("alpha", board("Renamed After Write"));
    const res = await fetch(`${baseUrl}/boards/alpha-board.json`);
    expect((await res.json()).nodes[0].label).toBe("Renamed After Write");
  });

  it("reports an unparseable board instead of hiding it", async () => {
    writeFileSync(join(boardDir, "broken-board.json"), "{ not json");
    const res = await fetch(`${baseUrl}/boards`);
    const { boards } = await res.json();
    expect(boards.find((b) => b.id === "broken").error).toMatch(/unreadable/);
    rmSync(join(boardDir, "broken-board.json"));
  });

  it("404s a board id that would traverse out of the board directory", async () => {
    for (const path of ["/boards/..-board.json", "/boards/%2e%2e%2f%2e%2e%2fetc%2fpasswd-board.json", "/boards/-board.json"]) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.status, path).toBe(404);
    }
  });

  it("404s a board that isn't there, in words a human can act on", async () => {
    const res = await fetch(`${baseUrl}/boards/nope-board.json`);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/no board "nope"/);
  });
});

describe("canvas assets", () => {
  it("serves index.html at the root", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    expect(await res.text()).toContain("canvas");
  });

  it("serves a hashed asset as immutable, and the HTML as not", async () => {
    const asset = await fetch(`${baseUrl}/assets/index-abc123.js`);
    expect(asset.headers.get("cache-control")).toMatch(/immutable/);
    const html = await fetch(`${baseUrl}/`);
    expect(html.headers.get("cache-control")).toBe("no-store");
  });

  it("falls back to index.html for a client-side path, but never outside dist", async () => {
    expect((await fetch(`${baseUrl}/some/client/route`)).status).toBe(200);
    expect((await fetch(`${baseUrl}/../../etc/passwd`)).status).toBeLessThan(500);
  });

  it("says what's missing when there is no build to serve", async () => {
    const empty = createQuickstartServer({ distDir: join(distDir, "..", "definitely-not-built"), boardDir });
    await new Promise((done) => empty.listen(0, "127.0.0.1", done));
    const res = await fetch(`http://127.0.0.1:${empty.address().port}/`);
    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/no build in/);
    empty.close();
  });
});
