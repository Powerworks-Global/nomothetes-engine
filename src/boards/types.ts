import type { ImportedBoard } from "../loadBoard";

/**
 * One way a board can be created/sourced. Deliberately separates *how* a
 * board comes to exist (kind) from *how it's consumed* (every source
 * exposes the same load() -> ImportedBoard shape) — the same idea
 * eventmodelers.ai's own CLI uses (any client attaches to a board by one
 * ID regardless of whether it was blank, AI-generated, or a workshop
 * export; creation method and consumption are decoupled).
 *
 * "upload" | "externalRepo" are plausible future kinds (file-upload board
 * source, or a source/sink reaching an external project's own git repo —
 * see docs/adr/0005-board-storage-lives-outside-this-repo.md for the
 * target shape) — not built now, but the shape already accommodates them
 * without a rewrite: just a new BoardSource entry with its own load().
 * "bundled" is deliberately not a kind any more (ADR 0005) — this repo
 * stores no board data of its own.
 */
export interface BoardSource {
  id: string;
  label: string;
  kind: "blank";
  load: () => ImportedBoard;
}
