import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runPlan } from "./interview-runner.mjs";
import { boardPathFor } from "./board-store.mjs";

const TEST_BOARD_ID = "test-interview-runner";
let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "interview-runner-test-"));
  // boardPathFor requires NOMOTHETES_BOARD_DIR (docs/adr/0005) - this repo
  // has no default board directory of its own, tests included.
  process.env.NOMOTHETES_BOARD_DIR = dir;
});

afterEach(() => {
  const boardPath = boardPathFor(TEST_BOARD_ID);
  delete process.env.NOMOTHETES_BOARD_DIR;
  rmSync(dir, { recursive: true, force: true });
  if (existsSync(boardPath)) rmSync(boardPath, { force: true });
});

describe("runPlan", () => {
  it("runs a multi-step plan, resolving $refs between steps automatically", () => {
    const steps = [
      {
        ref: "actor",
        skill: "place_element",
        args: { specId: "s", sliceId: "sl", sliceType: "command", laneId: "actor", label: "Member" },
      },
      {
        ref: "action",
        skill: "edit_timeline",
        args: { operation: "add", specId: "s", sliceId: "sl", sliceType: "command", laneId: "action", label: "Register", afterNodeId: "$actor" },
      },
    ];
    const report = runPlan(steps, { baseDir: dir, boardId: TEST_BOARD_ID });

    expect(report.halted).toBe(false);
    expect(report.applied).toBe(2);
    expect(report.stepsRun).toBe(2);
    expect(report.steps[1].outcome).toBe("applied");

    const board = JSON.parse(readFileSync(boardPathFor(TEST_BOARD_ID), "utf-8"));
    expect(board.edges).toHaveLength(1);
    expect(board.edges[0].source).toBe(board.nodes[0].id);
    expect(board.edges[0].target).toBe(board.nodes[1].id);
  });

  it("halts on the first step that doesn't apply, and doesn't run later steps", () => {
    const steps = [
      { skill: "place_element", args: { specId: "s", sliceId: "sl", sliceType: "command", laneId: "bogus", label: "x" } },
      { skill: "place_element", args: { specId: "s", sliceId: "sl", sliceType: "command", laneId: "actor", label: "Never reached" } },
    ];
    const report = runPlan(steps, { baseDir: dir, boardId: TEST_BOARD_ID });

    expect(report.halted).toBe(true);
    expect(report.stepsRun).toBe(1);
    expect(report.applied).toBe(0);

    const board = JSON.parse(readFileSync(boardPathFor(TEST_BOARD_ID), "utf-8"));
    expect(board.nodes).toHaveLength(0);
  });

  it("halts with a clear error when a step references an undefined $ref", () => {
    const steps = [{ skill: "edit_timeline", args: { operation: "rename", nodeId: "$never-defined", newLabel: "x" } }];
    const report = runPlan(steps, { baseDir: dir, boardId: TEST_BOARD_ID });

    expect(report.halted).toBe(true);
    expect(report.steps[0].outcome).toBe("halted");
    expect(report.steps[0].reason).toMatch(/no earlier step captured a ref/);
  });

  it("resolves a $ref nested inside a scenario object", () => {
    const steps = [
      { ref: "rule", skill: "edit_example_map", args: { sliceId: "sl", operation: "add_rule", label: "Must verify" } },
      {
        skill: "edit_example_map",
        args: {
          sliceId: "sl",
          operation: "add_example",
          ruleId: "$rule",
          label: "Happy path",
          scenario: { given: "a", when: "b", then: "c" },
        },
      },
    ];
    const report = runPlan(steps, { baseDir: dir, boardId: TEST_BOARD_ID });
    expect(report.applied).toBe(2);

    const board = JSON.parse(readFileSync(boardPathFor(TEST_BOARD_ID), "utf-8"));
    expect(board.seedExampleMaps.sl.edges).toHaveLength(1);
  });

  it("tags every task with the same sessionId, visible in the progress log", () => {
    const progressPath = join(dir, "progress.txt");
    const steps = [{ skill: "place_element", args: { specId: "s", sliceId: "sl", sliceType: "command", laneId: "actor", label: "x" } }];
    const report = runPlan(steps, { baseDir: dir, boardId: TEST_BOARD_ID, sessionId: "fixed-session", progressPath });

    expect(report.sessionId).toBe("fixed-session");
    expect(readFileSync(progressPath, "utf-8")).toContain("session fixed-session");
  });

  it("reports elapsed time per step and for the whole run", () => {
    const steps = [{ skill: "place_element", args: { specId: "s", sliceId: "sl", sliceType: "command", laneId: "actor", label: "x" } }];
    const report = runPlan(steps, { baseDir: dir, boardId: TEST_BOARD_ID });
    expect(typeof report.elapsedMs).toBe("number");
    expect(typeof report.steps[0].elapsedMs).toBe("number");
  });
});
