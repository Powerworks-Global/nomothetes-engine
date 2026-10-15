import type { ImportedBoard } from "../loadBoard";
import type { BoardSource } from "./types";

/** Boards the server this page was served from is holding on disk.
 *
 * Why a server at all (docs/adr/0005): this repo ships no board JSON, so Vite
 * has nothing to bundle, and the browser has no way to reach the board volume
 * the MCP server writes to. scripts/selfhost-server.mjs exposes exactly two
 * read endpoints over that volume — `GET /boards` (what exists) and
 * `GET /boards/<id>-board.json` (one board, read fresh per request) — and this
 * module is the canvas's half of that contract. Read-only by design: the write
 * path stays the MCP server's (ADR 0003), so the canvas gains a board to show
 * without the quickstart gaining an unauthenticated edit endpoint.
 *
 * Both endpoints are same-origin relative paths, so a deployment behind a
 * reverse proxy (ADR 0011's UAT/Prod shape) needs no build-time base URL. */

export interface ServedBoardSummary {
  id: string;
  specCount?: number;
  nodeCount?: number;
  edgeCount?: number;
  /** A board file the server could see but not parse is listed as broken
   * rather than dropped — a volume that lost a file must not read as empty. */
  error?: string;
}

const BOARDS_INDEX = "/boards";
const boardFile = (id: string) => `/boards/${encodeURIComponent(id)}-board.json`;

/** Minimal fetch surface, so the two callers below (and their tests) don't
 * each have to know how to unwrap a Response. */
type FetchLike = (input: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

/** Are we running somewhere that has a board server behind it? Plain
 * `npm run dev` does not (Vite answers `/boards` with index.html, which is why
 * this checks the parsed shape and not just `res.ok`) — and that's the normal
 * development case, not an error state: no server, no served boards, the
 * canvas keeps its "blank" source. */
export async function listServedBoards(fetchLike: FetchLike = fetch): Promise<ServedBoardSummary[]> {
  try {
    const res = await fetchLike(BOARDS_INDEX, { headers: { accept: "application/json" } });
    if (!res.ok) return [];
    const body = await res.json();
    if (!body || typeof body !== "object" || !Array.isArray((body as { boards?: unknown }).boards)) return [];
    return (body as { boards: ServedBoardSummary[] }).boards.filter((b) => typeof b?.id === "string" && !b.error);
  } catch {
    return [];
  }
}

export async function fetchServedBoard(id: string, fetchLike: FetchLike = fetch): Promise<ImportedBoard> {
  const res = await fetchLike(boardFile(id), { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`board "${id}" is not available from this server (HTTP ${res.status})`);
  const body = (await res.json()) as Partial<ImportedBoard>;
  if (!body || !Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
    throw new Error(`board "${id}" is not a valid board: expected nodes[] and edges[]`);
  }
  return body as ImportedBoard;
}

/** A BoardSource for one board the server is holding. `load()` is async — the
 * board comes off the network, unlike the in-memory "blank" source. */
export function servedBoardSource(summary: ServedBoardSummary): BoardSource {
  return {
    id: summary.id,
    label: summary.id,
    kind: "served",
    load: () => fetchServedBoard(summary.id),
  };
}

/** Which board the canvas shows on first paint: an explicit `?board=<id>`
 * always wins; otherwise the single served board when there is exactly one,
 * because that is the quickstart's case (one demo board on a fresh volume) and
 * opening a stack to an empty canvas when a board is sitting on the volume is
 * the "worked on my machine" failure this whole file exists to avoid. With two
 * or more boards the picker is left on "blank" rather than guessing which of
 * several a facilitator came for. */
export function initialServedBoardId(sources: { id: string }[], boardParam: string | null): string | null {
  if (boardParam) return sources.some((s) => s.id === boardParam) ? boardParam : null;
  return sources.length === 1 ? sources[0].id : null;
}
