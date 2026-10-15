import { describe, expect, it } from "vitest";
import { fetchServedBoard, initialServedBoardId, listServedBoards } from "./http";

/** Stands in for the board server (scripts/selfhost-server.mjs) without a
 * network: these tests are about how the canvas behaves on each response the
 * server can actually give, including the ones that aren't JSON at all. */
function stubFetch(response: { ok?: boolean; status?: number; body?: unknown; throws?: boolean }) {
  return async () => {
    if (response.throws) throw new Error("connection refused");
    return {
      ok: response.ok ?? true,
      status: response.status ?? 200,
      json: async () => {
        if (typeof response.body === "string") throw new SyntaxError("Unexpected token '<'");
        return response.body;
      },
    };
  };
}

describe("listServedBoards", () => {
  it("returns the boards a quickstart server advertises", async () => {
    const boards = await listServedBoards(
      stubFetch({ body: { boards: [{ id: "nomothetes-self", nodeCount: 4 }, { id: "other", error: "unreadable: boom" }] } }),
    );
    expect(boards).toEqual([{ id: "nomothetes-self", nodeCount: 4 }]);
  });

  it("is empty, not an error, when no board server is behind the page", async () => {
    // `npm run dev`: Vite answers /boards with index.html (200, HTML) - a
    // parse failure, not a board list. Must degrade to "no served boards".
    expect(await listServedBoards(stubFetch({ body: "<!doctype html>" }))).toEqual([]);
    expect(await listServedBoards(stubFetch({ ok: false, status: 404 }))).toEqual([]);
    expect(await listServedBoards(stubFetch({ throws: true }))).toEqual([]);
  });
});

describe("fetchServedBoard", () => {
  it("returns the board the volume is holding", async () => {
    const board = await fetchServedBoard(
      "nomothetes-self",
      stubFetch({ body: { nodes: [{ id: "n1" }], edges: [], seedExampleMaps: {} } }),
    );
    expect(board.nodes).toHaveLength(1);
  });

  it("rejects a response that isn't board-shaped rather than rendering garbage", async () => {
    await expect(fetchServedBoard("x", stubFetch({ body: { nodes: "not-an-array" } }))).rejects.toThrow(/not a valid board/);
    await expect(fetchServedBoard("x", stubFetch({ ok: false, status: 404 }))).rejects.toThrow(/not available from this server \(HTTP 404\)/);
  });
});

describe("initialServedBoardId", () => {
  const one = [{ id: "nomothetes-self" }];
  const many = [{ id: "a" }, { id: "b" }];

  it("shows the single served board on first paint (the quickstart's case)", () => {
    expect(initialServedBoardId(one, null)).toBe("nomothetes-self");
  });

  it("honours ?board= over the default", () => {
    expect(initialServedBoardId(many, "b")).toBe("b");
  });

  it("leaves the picker alone with several boards and no ?board=", () => {
    expect(initialServedBoardId(many, null)).toBeNull();
  });

  it("does not load a board the server doesn't have, just because the URL asked", () => {
    expect(initialServedBoardId(one, "not-on-this-server")).toBeNull();
  });

  it("has nothing to show when the server has nothing", () => {
    expect(initialServedBoardId([], null)).toBeNull();
  });
});
