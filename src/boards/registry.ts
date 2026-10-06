import type { BoardSource } from "./types";

/** No bundled boards (docs/adr/0005 — this repo stores no board data of
 * its own; every board belongs to the project it models, not to this
 * engine). "blank" is the only source: a facilitator adding a board gets
 * an empty one to build up live, same shape this project already used
 * for board-store.mjs's "a path that doesn't exist yet returns an empty
 * skeleton" behavior on the CLI/MCP side. A future board source that
 * reaches an external repo (per ADR 0005's "create-board creates a new
 * git repo" target shape) is a real `kind` this registry can grow to
 * hold once that exists — "bundled" is deliberately not one of today's
 * kinds any more. */
export const BOARD_SOURCES: BoardSource[] = [
  {
    id: "blank",
    label: "New board",
    kind: "blank",
    load: () => ({ nodes: [], edges: [] }),
  },
];

export const DEFAULT_BOARD_ID = "blank";
