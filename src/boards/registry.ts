import type { ImportedBoard } from "../loadBoard";
import type { BoardSource } from "./types";
import powerGymBoard from "../data/powergym-board.json";

/** Bundled boards are imported eagerly (small JSON, no code-splitting
 * need at this MVP's scale) so load() is synchronous — no loading-state
 * UI needed in App.tsx. Mirrors src/presets/catalog.ts's shape (a flat
 * declarative registry array) without reusing its types: board data
 * doesn't fit the preset system's scalar-value/override-layering model.
 *
 * This is the shared-engine copy of this project — real client/business
 * boards (Hadisfar Bridge, Hadisfar Health) live only in the private
 * checkout this was extracted from, not here.
 *
 * The Interview harness's own demo output (src/data/version1-demo*.json)
 * is deliberately NOT registered here — its edges (produced by the
 * Agentic Modeling write path, mcp-server/board-mutations.mjs) are
 * `{source, target}` only, missing the `id`/`label` this canvas's own
 * `ImportedBoard`/`ImportedEdge` type requires for rendering. That gap is
 * real (the write path was built for the MCP/task-queue consumer, never
 * for canvas rendering) and not something to paper over with a type
 * assertion. Inspect those boards via `node mcp-server/ambiguity-score.mjs`,
 * the raw JSON, or the MCP server's read tools — not this UI picker. */
export const BOARD_SOURCES: BoardSource[] = [
  {
    id: "powergym",
    label: "PowerGym",
    kind: "bundled",
    load: () => powerGymBoard as ImportedBoard,
  },
  {
    id: "blank",
    label: "New board",
    kind: "blank",
    load: () => ({ nodes: [], edges: [] }),
  },
];

export const DEFAULT_BOARD_ID = "powergym";
