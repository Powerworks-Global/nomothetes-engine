import { describe, expect, it } from "vitest";
import { editExampleMap, editTimeline, freezeSpec, placeElement, runWdyt } from "./board-mutations.mjs";

function emptyBoard() {
  return { nodes: [], edges: [], seedExampleMaps: {} };
}

describe("placeElement", () => {
  it("adds a node with a specId-namespaced id", () => {
    const board = emptyBoard();
    const node = placeElement(board, {
      specId: "002a-member-registration",
      sliceId: "slice-1",
      sliceType: "command",
      laneId: "screen",
      label: "Login Screen",
    });
    expect(board.nodes).toContain(node);
    expect(node.id.startsWith("002a-member-registration:")).toBe(true);
    expect(node.label).toBe("Login Screen");
  });

  it("adds a complete edge (id, source, target, label) when afterNodeId is given — not just source/target", () => {
    // Regression guard: placeElement previously emitted {source, target}
    // only, which the canvas (src/loadBoard.ts's ImportedEdge) couldn't
    // render at all — a board generated via this path was silently blank
    // in the UI. See Spec — Pre-Workshop Board Setup (2026-10-04).
    const board = emptyBoard();
    const first = placeElement(board, { specId: "s", sliceId: "sl", sliceType: "command", laneId: "actor", label: "Member" });
    const second = placeElement(board, { specId: "s", sliceId: "sl", sliceType: "command", laneId: "screen", label: "Form", afterNodeId: first.id });
    expect(board.edges).toHaveLength(1);
    const edge = board.edges[0];
    expect(typeof edge.id).toBe("string");
    expect(edge.id.length).toBeGreaterThan(0);
    expect(edge.source).toBe(first.id);
    expect(edge.target).toBe(second.id);
    expect(edge.label).toBe("triggers"); // target lane is "screen"
  });

  it("labels the edge \"produces\" when the target lane is not screen — matches scripts/import-eventmodelers.mjs's convention", () => {
    const board = emptyBoard();
    const first = placeElement(board, { specId: "s", sliceId: "sl", sliceType: "command", laneId: "actor", label: "Member" });
    const second = placeElement(board, { specId: "s", sliceId: "sl", sliceType: "command", laneId: "outcome", label: "Member Registered", afterNodeId: first.id });
    expect(board.edges[0].label).toBe("produces");
    expect(board.edges[0].target).toBe(second.id);
  });

  it("rejects an unknown laneId", () => {
    const board = emptyBoard();
    expect(() => placeElement(board, { specId: "s", sliceId: "sl", sliceType: "command", laneId: "bogus", label: "x" })).toThrow();
  });

  it("rejects a nonexistent afterNodeId", () => {
    const board = emptyBoard();
    expect(() =>
      placeElement(board, { specId: "s", sliceId: "sl", sliceType: "command", laneId: "actor", label: "x", afterNodeId: "does-not-exist" }),
    ).toThrow();
  });
});

describe("editTimeline", () => {
  it("add restricts laneId to action/outcome", () => {
    const board = emptyBoard();
    expect(() => editTimeline(board, { operation: "add", specId: "s", sliceId: "sl", sliceType: "command", laneId: "actor", label: "x" })).toThrow();
    const node = editTimeline(board, { operation: "add", specId: "s", sliceId: "sl", sliceType: "command", laneId: "action", label: "Submit" });
    expect(node.laneId).toBe("action");
  });

  it("rename changes an existing node's label", () => {
    const board = emptyBoard();
    const node = placeElement(board, { specId: "s", sliceId: "sl", sliceType: "command", laneId: "action", label: "Old" });
    editTimeline(board, { operation: "rename", nodeId: node.id, newLabel: "New" });
    expect(node.label).toBe("New");
  });

  it("rename throws for an unknown node", () => {
    const board = emptyBoard();
    expect(() => editTimeline(board, { operation: "rename", nodeId: "nope", newLabel: "x" })).toThrow();
  });

  it("reorder moves a node to appear before another", () => {
    const board = emptyBoard();
    const a = placeElement(board, { specId: "s", sliceId: "sl", sliceType: "command", laneId: "action", label: "A" });
    const b = placeElement(board, { specId: "s", sliceId: "sl", sliceType: "command", laneId: "action", label: "B" });
    const c = placeElement(board, { specId: "s", sliceId: "sl", sliceType: "command", laneId: "action", label: "C" });
    editTimeline(board, { operation: "reorder", nodeId: c.id, beforeNodeId: a.id });
    expect(board.nodes.map((n) => n.id)).toEqual([c.id, a.id, b.id]);
  });

  it("rejects an unknown operation", () => {
    const board = emptyBoard();
    expect(() => editTimeline(board, { operation: "delete" })).toThrow();
  });
});

describe("editExampleMap", () => {
  it("add_rule creates a rule card on a fresh slice", () => {
    const board = emptyBoard();
    const rule = editExampleMap(board, { sliceId: "sl", operation: "add_rule", label: "Members must verify email" });
    expect(board.seedExampleMaps.sl.nodes).toContainEqual(rule);
    expect(rule.data.nodeType).toBe("rule");
  });

  it("add_example links to an existing rule via an edge", () => {
    const board = emptyBoard();
    const rule = editExampleMap(board, { sliceId: "sl", operation: "add_rule", label: "Rule" });
    const example = editExampleMap(board, {
      sliceId: "sl",
      operation: "add_example",
      ruleId: rule.id,
      label: "Happy path",
      scenario: { given: "a member", when: "they verify", then: "they are activated" },
    });
    expect(board.seedExampleMaps.sl.edges).toContainEqual({ source: rule.id, target: example.id });
  });

  it("add_example rejects a nonexistent ruleId", () => {
    const board = emptyBoard();
    expect(() =>
      editExampleMap(board, { sliceId: "sl", operation: "add_example", ruleId: "nope", label: "x", scenario: {} }),
    ).toThrow();
  });

  it("edit_card updates label and scenario", () => {
    const board = emptyBoard();
    const example = editExampleMap(board, {
      sliceId: "sl",
      operation: "add_example",
      label: "Old",
      scenario: { given: "a", when: "b", then: "c" },
    });
    editExampleMap(board, { sliceId: "sl", operation: "edit_card", cardId: example.id, newLabel: "New", newScenario: { given: "x", when: "y", then: "z" } });
    expect(example.data.label).toBe("New");
    expect(example.data.scenario).toEqual({ given: "x", when: "y", then: "z" });
  });

  it("rejects an unknown operation", () => {
    const board = emptyBoard();
    expect(() => editExampleMap(board, { sliceId: "sl", operation: "delete_everything" })).toThrow();
  });
});

describe("runWdyt", () => {
  it("never mutates the board", () => {
    const board = emptyBoard();
    editExampleMap(board, { sliceId: "sl", operation: "add_rule", label: "Rule" });
    const before = JSON.stringify(board);
    runWdyt(board, { sliceId: "sl" });
    expect(JSON.stringify(board)).toBe(before);
  });

  it("flags an example missing a rule link", () => {
    const board = emptyBoard();
    editExampleMap(board, { sliceId: "sl", operation: "add_example", label: "Orphan", scenario: { given: "a", when: "b", then: "c" } });
    const { findings } = runWdyt(board, { sliceId: "sl" });
    expect(findings.some((f) => f.includes("no linked Rule card"))).toBe(true);
  });

  it("flags an example with an incomplete scenario", () => {
    const board = emptyBoard();
    editExampleMap(board, { sliceId: "sl", operation: "add_example", label: "Incomplete", scenario: { given: "a", when: "", then: "c" } });
    const { findings } = runWdyt(board, { sliceId: "sl" });
    expect(findings.some((f) => f.includes('missing "when"'))).toBe(true);
  });

  it("flags unresolved question cards", () => {
    const board = emptyBoard();
    editExampleMap(board, { sliceId: "sl", operation: "add_question", label: "What happens on timeout?" });
    const { findings } = runWdyt(board, { sliceId: "sl" });
    expect(findings.some((f) => f.includes("Unresolved Question card"))).toBe(true);
  });

  it("returns a no-map finding for a slice with no Example Map yet", () => {
    const board = emptyBoard();
    const { findings } = runWdyt(board, { sliceId: "nonexistent" });
    expect(findings[0]).toMatch(/No Example Map exists/);
  });
});

describe("freezeSpec", () => {
  it("marks a specId frozen with a timestamp", () => {
    const board = emptyBoard();
    const result = freezeSpec(board, { specId: "s" });
    expect(result.specId).toBe("s");
    expect(board.frozenSpecs.s.frozenAt).toBe(result.frozenAt);
  });

  it("throws on a second freeze of the same specId", () => {
    const board = emptyBoard();
    freezeSpec(board, { specId: "s" });
    expect(() => freezeSpec(board, { specId: "s" })).toThrow(/already frozen/);
  });

  it("does not affect other specIds", () => {
    const board = emptyBoard();
    freezeSpec(board, { specId: "s" });
    expect(() => placeElement(board, { specId: "other", sliceId: "sl", sliceType: "command", laneId: "actor", label: "x" })).not.toThrow();
  });
});

describe("placeElement freeze guard", () => {
  it("rejects placing a new element on a frozen specId", () => {
    const board = emptyBoard();
    freezeSpec(board, { specId: "s" });
    expect(() => placeElement(board, { specId: "s", sliceId: "sl", sliceType: "command", laneId: "actor", label: "x" })).toThrow(/is frozen/);
  });

  it("allows placement before a specId is frozen", () => {
    const board = emptyBoard();
    expect(() => placeElement(board, { specId: "s", sliceId: "sl", sliceType: "command", laneId: "actor", label: "x" })).not.toThrow();
  });
});
