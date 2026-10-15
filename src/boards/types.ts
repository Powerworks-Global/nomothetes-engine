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
 *
 * "served" IS built (see src/boards/http.ts): a board the server this page
 * came from is holding on disk, which is how the self-host quickstart shows a
 * real board without this repo containing one. It is the first kind whose
 * load() is async, which is why load()'s return type is a union — a network
 * source can't be synchronous, and pretending otherwise is what left
 * "blank" as the only kind for as long as every source was in-memory.
 */
export interface BoardSource {
  id: string;
  label: string;
  kind: "blank" | "served";
  load: () => ImportedBoard | Promise<ImportedBoard>;
}
