#!/usr/bin/env node
// Streamable HTTP transport entry point for the MCP server.
//
// Why this exists: the stdio entry (index.mjs) is spawned by an MCP client
// that already has a shell on this machine, which is exactly what a stranger
// evaluating this project from a docker-compose file does not have. HTTP
// means the quickstart's tool surface is reachable with curl and with any
// harness configured with a URL.
//
// Same rule as every other entry point: there is ONE board write path
// (ADR 0003/0004 — re-read fresh inside withBoardLock) and it lives in
// tools.mjs. This file adds a transport, not a second implementation — see
// http-server.test.mjs, which asserts the surface served here matches
// tools.mjs exactly.
//
// Transport shape: stateful sessions, one McpServer + one
// StreamableHTTPServerTransport per `Mcp-Session-Id`, per the SDK's own
// Streamable HTTP guidance. A single shared transport would look like it
// works when the quickstart's one curl client uses it and then break for the
// second client that connects (two clients, one session id, interleaved
// state) — the failure would land on the user, far from the cause.
//
// Transit security: this listener is plain HTTP, which ADR 0010
// (docs/adr/0010-transit-security-tls13-and-cert-pinning.md) does NOT permit
// for a real deployment. That is a deliberate, stated scope limit of the
// quickstart, not a decision that TLS doesn't matter: docker-compose.yml
// publishes this port on 127.0.0.1 only, so nothing leaves the machine, and
// TLS 1.3 termination belongs to the reverse proxy ADR 0011's UAT/Prod
// topology puts in front. There is no authentication here either (ADR 0006's
// identity layer is unbuilt) — which is precisely why the loopback binding is
// the default rather than an exercise left to the reader.

import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createBoardMcpServer, SERVER_INFO } from "./tools.mjs";

/** Hosts accepted in the Host header. Binding 0.0.0.0 inside a container is
 * necessary for a published port to reach us, but it opts out of the SDK's
 * automatic localhost-only DNS-rebinding protection — so we name the allowed
 * hosts explicitly instead of shipping the unprotected bind. `localhost` and
 * `127.0.0.1` cover the quickstart's published-port path (the browser's/curl's
 * Host header is whatever the user typed); set MCP_ALLOWED_HOSTS to add a
 * hostname when something on a docker network reaches this service by
 * container name. */
function allowedHosts(host) {
  const fromEnv = (process.env.MCP_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  // An explicit loopback bind needs no widening; 0.0.0.0 (the container case)
  // gets the loopback names, which is what reaches it through a 127.0.0.1
  // published port.
  return host === "0.0.0.0" || host === "::" ? ["localhost", "127.0.0.1", "::1"] : undefined;
}

function isInitializeRequest(body) {
  return Boolean(body) && typeof body === "object" && body.method === "initialize";
}

export async function startHttpMcpServer({ port = Number(process.env.MCP_PORT ?? 3001), host = process.env.MCP_HOST ?? "0.0.0.0" } = {}) {
  const app = createMcpExpressApp({ host, allowedHosts: allowedHosts(host) });

  /** sessionId -> transport. Its McpServer is reachable as transport.server
   * (the SDK sets it on connect), which is all close() needs. */
  const sessions = new Map();

  app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", server: SERVER_INFO.name, version: SERVER_INFO.version });
  });

  app.post("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    try {
      let transport;
      if (sessionId && sessions.has(sessionId)) {
        transport = sessions.get(sessionId);
      } else if (!sessionId && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, transport);
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) sessions.delete(transport.sessionId);
        };
        await createBoardMcpServer().connect(transport);
      } else {
        // A non-initialize request with no (or unknown) session id is a
        // client that skipped initialize or whose session already closed —
        // tell it so, rather than half-serving it.
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: no valid session id; send initialize first, then reuse its Mcp-Session-Id header." },
          id: null,
        });
        return;
      }
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: err.message }, id: null });
      }
    }
  });

  const handleSessionRequest = async (req, res) => {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).send("Invalid or missing Mcp-Session-Id header");
      return;
    }
    await sessions.get(sessionId).handleRequest(req, res);
  };

  app.get("/mcp", handleSessionRequest); // SSE stream for server-initiated messages
  app.delete("/mcp", handleSessionRequest); // explicit session close

  const server = app.listen(port, host);
  server.on("close", () => {
    for (const transport of sessions.values()) transport.close();
    sessions.clear();
  });

  // Resolved from the listening event: `server.address()` is null until the
  // socket is actually bound, and the ephemeral-port case (the tests) needs
  // the real port back, not the 0 it was asked for.
  return new Promise((done, fail) => {
    server.once("error", fail);
    server.once("listening", () => {
      const bound = server.address().port;
      console.log(`Nomothetes MCP server (Streamable HTTP) listening on http://${host}:${bound}/mcp`);
      done({ server, sessions, port: bound });
    });
  });
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  startHttpMcpServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
