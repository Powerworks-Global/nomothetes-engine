import type { ImportedBoard } from "../loadBoard";

/**
 * One way a board can be created/sourced. Deliberately separates *how* a
 * board comes to exist (kind) from *how it's consumed* (every source
 * exposes the same load() -> ImportedBoard shape) — the same idea
 * eventmodelers.ai's own CLI uses (any client attaches to a board by one
 * ID regardless of whether it was blank, AI-generated, or a workshop
 * export; creation method and consumption are decoupled).
 *
 * "upload" | "mcp" are plausible future kinds (file-upload board source,
 * or an MCP-backed source/sink once the MCP server gains write
 * capability) — not built now, but the shape already accommodates them
 * without a rewrite: just a new BoardSource entry with its own load().
 */
export interface BoardSource {
  id: string;
  label: string;
  kind: "bundled" | "blank";
  load: () => ImportedBoard;
}
