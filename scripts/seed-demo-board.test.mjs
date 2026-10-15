import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_DEMO_BOARD_ID, plansInSequenceOrder, seedDemoBoard } from "./seed-demo-board.mjs";

// The quickstart's first-start experience, tested as the behaviour a stranger
// sees: does a fresh volume end up with a real board, and does a restart keep
// the one that's already there instead of resetting it.

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "seed-demo-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// board-store.mjs resolves the board path from the environment (ADR 0005), so
// the test points it at a temp dir rather than at anyone's real board volume.
const options = () => ({ boardId: DEFAULT_DEMO_BOARD_ID, baseDir: join(dir, "inbox"), progressPath: join(dir, "progress.txt") });

describe("plansInSequenceOrder", () => {
  it("orders the committed plans by the facilitator sequence, not by filename", () => {
    const roles = plansInSequenceOrder().map((p) => p.role);
    expect(roles).toEqual(["ontologist", "contrarian", "simplifier"]);
  });

  it("reads which spec gets seeded from the fixtures rather than hardcoding it", () => {
    for (const { specId } of plansInSequenceOrder()) expect(specId).toBeTruthy();
  });
});

describe("seedDemoBoard", () => {
  it("builds a real board through the queue/worker path on a fresh volume", () => {
    process.env.NOMOTHETES_BOARD_DIR = dir;
    const result = seedDemoBoard(options());

    expect(result.plansRun.every((p) => !p.halted)).toBe(true);
    expect(result.board).toMatchObject({ nodes: 4, edges: 2, exampleMaps: 1 });
    // The Interview's own stop-condition runs on the result - the demo board
    // shows what a pass-1 board looks like, questions and all.
    expect(result.ambiguityScore.specId).toBe("board-co-review");

    const onDisk = JSON.parse(readFileSync(join(dir, `${DEFAULT_DEMO_BOARD_ID}-board.json`), "utf-8"));
    expect(onDisk.nodes.map((n) => n.label)).toEqual(["Facilitator", "Co-Reviewer", "Invite Co-Reviewer", "Co-Reviewer Invited"]);
    expect(existsSync(join(dir, "progress.txt")), "every step must be logged like any other Agentic Modeling run").toBe(true);
  });

  it("leaves an existing board alone, which is what makes a restart non-destructive", () => {
    process.env.NOMOTHETES_BOARD_DIR = dir;
    seedDemoBoard(options());
    const before = readFileSync(join(dir, `${DEFAULT_DEMO_BOARD_ID}-board.json`), "utf-8");

    const second = seedDemoBoard(options());

    expect(second.seeded).toBe(false);
    expect(second.reason).toMatch(/already exists/);
    expect(readFileSync(join(dir, `${DEFAULT_DEMO_BOARD_ID}-board.json`), "utf-8")).toBe(before);
  });
});
