import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claimAndProcessOne, formatProgressEntry, processTask } from "./agentic-worker.mjs";
import { createTaskStore } from "./task-queue.mjs";
import { boardPathFor } from "./board-store.mjs";

function emptyBoard() {
  return { nodes: [], edges: [], seedExampleMaps: {} };
}

describe("processTask", () => {
  it("applies a well-formed place_element prompt and mutates the board", () => {
    const board = emptyBoard();
    const task = {
      id: "t1",
      prompts: [
        '/place_element {"specId":"s","sliceId":"sl","sliceType":"command","laneId":"actor","label":"Member"}',
      ],
    };
    const results = processTask(task, board);
    expect(results).toHaveLength(1);
    expect(results[0].outcome).toBe("applied");
    expect(board.nodes).toHaveLength(1);
    expect(board.nodes[0].label).toBe("Member");
  });

  it("rejects a prompt the sanitizer flags, without applying it", () => {
    const board = emptyBoard();
    const task = { id: "t2", prompts: ["rm -rf /"] };
    const results = processTask(task, board);
    expect(results[0].outcome).toBe("rejected");
    expect(results[0].reason).toContain("shell-command");
    expect(board.nodes).toHaveLength(0);
  });

  it("fails a prompt that doesn't match the /skill-name {json} syntax", () => {
    const board = emptyBoard();
    const task = { id: "t3", prompts: ["please add a node for me"] };
    const results = processTask(task, board);
    expect(results[0].outcome).toBe("failed");
    expect(results[0].reason).toContain("did not match");
  });

  it("fails a prompt naming an unknown skill", () => {
    const board = emptyBoard();
    const task = { id: "t4", prompts: ['/delete_everything {"foo":"bar"}'] };
    const results = processTask(task, board);
    expect(results[0].outcome).toBe("failed");
    expect(results[0].reason).toContain("unknown skill");
  });

  it("fails a prompt whose skill call throws, without stopping other prompts in the task", () => {
    const board = emptyBoard();
    const task = {
      id: "t5",
      prompts: [
        '/place_element {"specId":"s","sliceId":"sl","sliceType":"command","laneId":"bogus","label":"x"}',
        '/place_element {"specId":"s","sliceId":"sl","sliceType":"command","laneId":"actor","label":"Good"}',
      ],
    };
    const results = processTask(task, board);
    expect(results[0].outcome).toBe("failed");
    expect(results[1].outcome).toBe("applied");
    expect(board.nodes).toHaveLength(1);
    expect(board.nodes[0].label).toBe("Good");
  });

  it("never mutates the board for a run_wdyt prompt", () => {
    const board = emptyBoard();
    board.seedExampleMaps.sl = { nodes: [{ id: "q1", data: { nodeType: "question", label: "?" } }], edges: [] };
    const before = JSON.stringify(board);
    const task = { id: "t6", prompts: ['/run_wdyt {"sliceId":"sl"}'] };
    const results = processTask(task, board);
    expect(results[0].outcome).toBe("applied");
    expect(JSON.stringify(board)).toBe(before);
  });
});

describe("formatProgressEntry", () => {
  it("matches PowerGym's progress.txt entry shape", () => {
    const task = { id: "abc-123", prompts: ["/place_element {}"] };
    const results = [{ prompt: "/place_element {}", outcome: "applied", skill: "place_element", result: { id: "x" } }];
    const entry = formatProgressEntry(task, results);
    expect(entry).toMatch(/^## \[.+\] — Task abc-123/);
    expect(entry).toContain("Prompts processed:");
    expect(entry).toContain("- [applied] /place_element {}");
    expect(entry).toContain("Outcome: 1 applied, 0 failed/rejected.");
  });

  it("counts rejected and failed prompts as not-applied in the outcome line", () => {
    const task = { id: "t", prompts: [] };
    const results = [
      { prompt: "a", outcome: "applied" },
      { prompt: "b", outcome: "rejected", reason: "sanitizer: off-topic" },
      { prompt: "c", outcome: "failed", reason: "unknown skill" },
    ];
    const entry = formatProgressEntry(task, results);
    expect(entry).toContain("Outcome: 1 applied, 2 failed/rejected.");
    expect(entry).toContain("- [rejected] b — sanitizer: off-topic");
    expect(entry).toContain("- [failed] c — unknown skill");
  });

  it("tags the header with sessionId and boardId when present", () => {
    const task = { id: "abc-123", prompts: [], sessionId: "sess-1", boardId: "demo" };
    const entry = formatProgressEntry(task, []);
    expect(entry).toMatch(/^## \[.+\] — Task abc-123 \(session sess-1, board demo\)/);
  });

  it("omits the tag parenthetical entirely when neither is set", () => {
    const task = { id: "abc-123", prompts: [] };
    const entry = formatProgressEntry(task, []);
    expect(entry.split("\n")[0]).toBe(`## [${entry.match(/\[(.+?)\]/)[1]}] — Task abc-123`);
  });
});

describe("claimAndProcessOne", () => {
  const TEST_BOARD_ID = "test-claim-and-process-one";
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "agentic-worker-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    const boardPath = boardPathFor(TEST_BOARD_ID);
    if (existsSync(boardPath)) rmSync(boardPath, { force: true });
  });

  it("returns null when the queue is empty", () => {
    const store = createTaskStore(dir);
    expect(claimAndProcessOne(store)).toBeNull();
  });

  it("claims, applies, writes the board, and completes the task", () => {
    const store = createTaskStore(dir);
    store.addTask({
      prompts: ['/place_element {"specId":"s","sliceId":"sl","sliceType":"command","laneId":"actor","label":"Member"}'],
      boardId: TEST_BOARD_ID,
    });

    const outcome = claimAndProcessOne(store);
    expect(outcome.results[0].outcome).toBe("applied");
    expect(outcome.results[0].result.label).toBe("Member");
    expect(store.listState("done")).toHaveLength(1);
    expect(store.listState("pending")).toHaveLength(0);

    const board = JSON.parse(readFileSync(boardPathFor(TEST_BOARD_ID), "utf-8"));
    expect(board.nodes).toHaveLength(1);
  });

  it("writes the progress entry to progressPath when given", () => {
    const store = createTaskStore(dir);
    const progressPath = join(dir, "progress.txt");
    store.addTask({ prompts: ['/run_wdyt {"sliceId":"nope"}'], boardId: TEST_BOARD_ID });

    claimAndProcessOne(store, { progressPath });
    expect(existsSync(progressPath)).toBe(true);
    expect(readFileSync(progressPath, "utf-8")).toContain("run_wdyt");
  });

  it("fails the task (rather than throwing past the caller) when every prompt fails", () => {
    const store = createTaskStore(dir);
    store.addTask({ prompts: ["not a valid prompt"], boardId: TEST_BOARD_ID });

    const outcome = claimAndProcessOne(store);
    expect(outcome.results[0].outcome).toBe("failed");
    expect(store.listState("failed")).toHaveLength(1);
    expect(store.listState("done")).toHaveLength(0);
  });
});
