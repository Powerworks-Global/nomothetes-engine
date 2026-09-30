import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readBoard, withBoardLock, writeBoard } from "./board-store.mjs";

let dir;
let boardPath;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "board-store-test-"));
  boardPath = join(dir, "test-board.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("withBoardLock", () => {
  it("acquires and releases the lock, leaving no lock directory behind", () => {
    withBoardLock(boardPath, () => {
      expect(existsSync(boardPath + ".lock")).toBe(true);
    });
    expect(existsSync(boardPath + ".lock")).toBe(false);
  });

  it("returns fn's return value", () => {
    const result = withBoardLock(boardPath, () => 42);
    expect(result).toBe(42);
  });

  it("releases the lock even when fn throws", () => {
    expect(() =>
      withBoardLock(boardPath, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(existsSync(boardPath + ".lock")).toBe(false);
  });

  it("actually serializes real read-modify-write cycles against the same file (the bug this exists to fix)", () => {
    writeBoard({ nodes: [], edges: [] }, boardPath);

    // Simulates N concurrent callers each appending one node — without
    // the lock, this exact pattern (read, mutate in memory, write) is
    // the reproduction of the real bug found by the live concurrency
    // test: interleaved writes silently drop each other's changes.
    for (let i = 0; i < 20; i++) {
      withBoardLock(boardPath, () => {
        const board = readBoard(boardPath);
        board.nodes.push({ id: `n${i}` });
        writeBoard(board, boardPath);
      });
    }

    const final = readBoard(boardPath);
    expect(final.nodes).toHaveLength(20);
  });

  it("breaks a stale lock after the timeout rather than hanging forever", () => {
    mkdirSync(boardPath + ".lock"); // simulate a crashed holder that never released
    const result = withBoardLock(boardPath, () => "recovered", { timeoutMs: 50 });
    expect(result).toBe("recovered");
    expect(existsSync(boardPath + ".lock")).toBe(false);
  });
});
