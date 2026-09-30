import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskStore } from "./task-queue.mjs";

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "task-queue-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("createTaskStore", () => {
  it("creates the pending/processing/done/failed state directories", () => {
    createTaskStore(dir);
    for (const state of ["pending", "processing", "done", "failed"]) {
      expect(existsSync(join(dir, state))).toBe(true);
    }
  });

  it("adds a task and claims it, moving it out of pending", () => {
    const store = createTaskStore(dir);
    store.addTask({ prompts: ["place a screen node"] });

    expect(store.listState("pending")).toHaveLength(1);

    const claimed = store.claimNextTask();
    expect(claimed.prompts).toEqual(["place a screen node"]);
    expect(store.listState("pending")).toHaveLength(0);
    expect(store.listState("processing")).toHaveLength(1);
  });

  it("returns null when the queue is empty", () => {
    const store = createTaskStore(dir);
    expect(store.claimNextTask()).toBeNull();
  });

  it("carries an optional sessionId through unchanged, defaulting to null", () => {
    const store = createTaskStore(dir);
    const tagged = store.addTask({ prompts: ["x"], sessionId: "sess-1" });
    expect(tagged.sessionId).toBe("sess-1");
    const untagged = store.addTask({ prompts: ["y"] });
    expect(untagged.sessionId).toBeNull();
  });

  it("claims priority:true tasks before non-priority tasks regardless of age", () => {
    const store = createTaskStore(dir);
    store.addTask({ prompts: ["old, low priority"], priority: false });
    store.addTask({ prompts: ["new, high priority"], priority: true });

    const claimed = store.claimNextTask();
    expect(claimed.prompts).toEqual(["new, high priority"]);
  });

  it("claims earliest createdAt first among same-priority tasks", () => {
    const store = createTaskStore(dir);
    const first = store.addTask({ prompts: ["first"] });
    const second = store.addTask({ prompts: ["second"] });
    // Force a deterministic ordering independent of real-clock resolution.
    first.createdAt = "2026-01-01T00:00:00.000Z";
    second.createdAt = "2026-01-02T00:00:00.000Z";
    writeFileSync(join(dir, "pending", `${first.id}.json`), JSON.stringify(first));
    writeFileSync(join(dir, "pending", `${second.id}.json`), JSON.stringify(second));

    const claimed = store.claimNextTask();
    expect(claimed.id).toBe(first.id);
  });

  it("never claims the same task twice (double-claim safety)", () => {
    const store = createTaskStore(dir);
    store.addTask({ prompts: ["only task"] });

    const first = store.claimNextTask();
    const second = store.claimNextTask();

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("moves a completed task from processing to done", () => {
    const store = createTaskStore(dir);
    const task = store.addTask({ prompts: ["do the thing"] });
    store.claimNextTask();
    store.completeTask(task.id);

    expect(store.listState("processing")).toHaveLength(0);
    expect(store.listState("done")).toHaveLength(1);
  });

  it("moves a failed task from processing to failed, recording the error", () => {
    const store = createTaskStore(dir);
    const task = store.addTask({ prompts: ["do the thing"] });
    store.claimNextTask();
    store.failTask(task.id, new Error("sanitizer rejected all prompts"));

    expect(store.listState("processing")).toHaveLength(0);
    const [failed] = store.listState("failed");
    expect(failed.error).toBe("sanitizer rejected all prompts");
  });

  it("rejects an empty prompts array", () => {
    const store = createTaskStore(dir);
    expect(() => store.addTask({ prompts: [] })).toThrow();
  });
});
