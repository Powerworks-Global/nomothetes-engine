# Nomothetes Engine — self-host quickstart image
#
# One image, both services: the built canvas and the MCP HTTP server, run by
# start-services.mjs (seed the demo board, then supervise both). Two images
# would be the "proper" compose shape, but it would also mean a stranger
# following this quickstart has to understand a shared board volume between two
# containers before they've seen a board — the single service is the point.
#
# Pinned by full version + alpine release, not `latest`: `latest` is the tag
# that turns a working quickstart into a broken one on somebody else's machine
# six months from now, with nothing to bisect against.

# ---------- build: needs the dev dependencies (typescript, vite) ----------
FROM node:22.20.0-alpine3.21 AS build
WORKDIR /app

# Lockfile first, so a source-only change reuses the installed-deps layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- runtime: production dependencies only ----------
# `npm run preview`/`vite preview` is not usable here — vite is a
# devDependency and is deliberately absent from the runtime stage. The web
# server is scripts/selfhost-server.mjs (node builtins only) for that reason:
# a quickstart served by a devDependency is a quickstart that only works on a
# machine with a dev install.
FROM node:22.20.0-alpine3.21 AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# What actually runs: the built canvas, the MCP server (tools.mjs + both
# transports + board store/mutations), the scripts the quickstart serves and
# seeds with, and the supervisor that starts them.
COPY --from=build /app/dist ./dist
COPY mcp-server ./mcp-server
COPY scripts ./scripts
COPY start-services.mjs ./

# src/presets is not leftover frontend code: scripts/presets.mjs — the config
# contract this repo resolves every tool/workflow setting through — imports
# catalog.ts and resolver.ts directly, so export_specifications can't even be
# imported without them (the runtime image died at startup on this the first
# time it was actually run, which is the difference between building an image
# and running one). It is TypeScript at runtime, which node >=22.18 strips on
# import by default — the base image above is pinned to 22.20 for that reason,
# and re-pinning it below 22.18 breaks the container, not the build.
COPY src/presets ./src/presets

# /app/boards is the named volume's mount point — the only thing here that is
# expected to outlive the container. /app/agentic-modeling holds the task
# queue's transient state (pending/processing/done), which is deliberately NOT
# on the volume: it's per-run scratch, and persisting it would resurrect old
# task files into every later start.
#
# Owned by `node` (the unprivileged user the node images ship with) BEFORE the
# volume is first mounted, so Docker initialises the volume with those
# permissions — otherwise the first seed write fails as a non-root container
# and the quickstart dies at exactly the step that makes it a demo.
RUN mkdir -p /app/boards /app/agentic-modeling/inbox \
  && chown -R node:node /app
USER node

# 5173: canvas (and /boards, its read window onto the volume)
# 3001: MCP over Streamable HTTP at /mcp
EXPOSE 5173 3001

# Both listeners answer /healthz; wget is busybox-provided in the alpine base,
# so this needs no extra tooling in the image.
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:5173/healthz || exit 1

CMD ["node", "start-services.mjs"]
