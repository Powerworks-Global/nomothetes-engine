#!/usr/bin/env node
// Static UI + board-file HTTP server for the self-host quickstart.
//
// What it is: the built canvas (dist/) plus a read-only window onto the board
// volume, on one port. Node builtins only — no express, no serve-handler —
// because the runtime image installs production dependencies only, and a
// quickstart whose web server is a devDependency (which is what
// `vite preview` would have been) is a quickstart that only works on a
// developer's machine.
//
// Two things the canvas needs from the server, and why they're here rather
// than baked in at build time (ADR 0005: this repo stores no board data, so
// there is no board JSON for Vite to bundle):
//   GET /boards                  -> which boards exist on this volume
//   GET /boards/<id>-board.json  -> that board, read fresh off the volume
// Fresh read per request is the point: it's what makes an MCP write visible
// in the canvas on the next load without rebuilding anything, and what makes
// "restart the stack, the board is still there" observable rather than
// asserted.
//
// Scope limit, stated: this serves, it does not write. The board write path is
// the MCP server's (ADR 0003) — there is no HTTP mutation endpoint here, so
// the quickstart doesn't ship a second, unauthenticated way to edit a board.

import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

/** Board ids are restricted to what board-store.mjs could have written in the
 * first place, so an id arriving from a URL can never traverse out of the
 * board directory (`..`, absolute paths, or a symlink name with separators). */
const BOARD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function boardIdFromPath(pathname) {
  const match = /^\/boards\/([^/]+)-board\.json$/.exec(pathname);
  if (!match) return null;
  const id = decodeURIComponent(match[1]);
  return BOARD_ID.test(id) ? id : null;
}

/** Summary of every board on the volume. Shape is what src/boards/http.ts
 * turns into canvas board sources; counts come from the file itself rather
 * than being reported by whoever wrote it, so the UI's "what's on this
 * server" list can't lie about the board it's offering to load. */
export async function boardsIndex(boardDir) {
  if (!boardDir || !existsSync(boardDir)) return [];
  const files = (await readdir(boardDir)).filter((f) => f.endsWith("-board.json"));
  const boards = [];
  for (const file of files) {
    const id = file.slice(0, -"-board.json".length);
    try {
      const board = JSON.parse(await readFile(join(boardDir, file), "utf-8"));
      const specs = new Set((board.nodes ?? []).map((n) => n.specId));
      boards.push({
        id,
        specCount: specs.size,
        nodeCount: (board.nodes ?? []).length,
        edgeCount: (board.edges ?? []).length,
      });
    } catch (err) {
      // A board file that won't parse is reported as broken, not hidden —
      // silence here would make a corrupt volume look like an empty one.
      boards.push({ id, error: `unreadable: ${err.message}` });
    }
  }
  return boards.sort((a, b) => a.id.localeCompare(b.id));
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function json(res, status, value) {
  const body = JSON.stringify(value, null, 2);
  send(res, status, body, { "content-type": MIME[".json"], "cache-control": "no-store" });
}

/** A request that escapes distDir is a 404, not a 403: there is nothing to
 * advertise about which parent paths exist on this machine. */
function safeJoin(rootDir, relPath) {
  const target = resolve(join(rootDir, relPath));
  const root = resolve(rootDir);
  return target === root || target.startsWith(root + sep) ? target : null;
}

export function createQuickstartServer({
  distDir = process.env.UI_DIST_DIR ?? resolve(process.cwd(), "dist"),
  boardDir = process.env.NOMOTHETES_BOARD_DIR,
} = {}) {
  return createServer(async (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, "Method Not Allowed", { allow: "GET, HEAD" });
      return;
    }

    const pathname = decodeURIComponent((req.url ?? "/").split("?")[0]);

    if (pathname === "/healthz") {
      json(res, 200, { status: "ok" });
      return;
    }

    if (pathname === "/boards" || pathname === "/boards/") {
      json(res, 200, { boards: await boardsIndex(boardDir) });
      return;
    }

    const boardId = boardIdFromPath(pathname);
    if (boardId) {
      if (!boardDir) {
        json(res, 503, { error: "no board directory configured - set NOMOTHETES_BOARD_DIR" });
        return;
      }
      const target = safeJoin(boardDir, `${boardId}-board.json`);
      if (!target) {
        send(res, 404, "Not Found");
        return;
      }
      try {
        const body = await readFile(target);
        send(res, 200, body, { "content-type": MIME[".json"], "cache-control": "no-store" });
      } catch {
        json(res, 404, { error: `no board "${boardId}" on this server` });
      }
      return;
    }

    // Anything else under /boards/ is a malformed board path. Answer it here
    // rather than letting it fall through to the SPA fallback, which would
    // hand back index.html for a board request and show up in the canvas as a
    // confusing JSON parse error.
    if (pathname === "/boards" || pathname.startsWith("/boards/")) {
      json(res, 404, { error: `not a board path: ${pathname} - expected /boards or /boards/<id>-board.json` });
      return;
    }

    // Static canvas: hashed assets from dist/, with index.html as the
    // single-page fallback (the canvas has no server-rendered routes).
    const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const target = safeJoin(distDir, rel);
    if (!target) {
      send(res, 404, "Not Found");
      return;
    }
    try {
      const body = await readFile(target);
      const ext = extname(target);
      const cache = ext === ".html" ? "no-store" : rel.startsWith("assets/") ? "public, max-age=31536000, immutable" : "no-store";
      send(res, 200, body, { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": cache });
    } catch {
      try {
        const body = await readFile(join(distDir, "index.html"));
        send(res, 200, body, { "content-type": MIME[".html"], "cache-control": "no-store" });
      } catch {
        send(res, 404, `Not Found - no build in ${distDir} (run \`npm run build\` or use the Docker quickstart)`);
      }
    }
  });
}

export function startQuickstartServer(options = {}) {
  const port = Number(options.port ?? process.env.UI_PORT ?? 5173);
  const host = options.host ?? process.env.UI_HOST ?? "0.0.0.0";
  const server = createQuickstartServer(options);
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.listen(port, host, () => {
      console.log(`Nomothetes UI + board server listening on http://${host}:${server.address().port}`);
      done({ server, port: server.address().port });
    });
  });
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  startQuickstartServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
