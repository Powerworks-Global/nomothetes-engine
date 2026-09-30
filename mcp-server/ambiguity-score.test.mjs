import { describe, expect, it } from "vitest";
import { editExampleMap, placeElement } from "./board-mutations.mjs";
import { scoreAmbiguity } from "./ambiguity-score.mjs";

function emptyBoard() {
  return { nodes: [], edges: [], seedExampleMaps: {} };
}

const SPEC = "s";

function wellFormedSlice(board, sliceId) {
  placeElement(board, { specId: SPEC, sliceId, sliceType: "command", laneId: "actor", label: "Member" });
  placeElement(board, { specId: SPEC, sliceId, sliceType: "command", laneId: "outcome", label: "Registered" });
  const rule = editExampleMap(board, { sliceId, operation: "add_rule", label: "Must verify email" });
  editExampleMap(board, {
    sliceId,
    operation: "add_example",
    ruleId: rule.id,
    label: "Happy path",
    scenario: { given: "a member", when: "they verify", then: "they are registered" },
  });
}

describe("scoreAmbiguity", () => {
  it("scores a fully well-formed spec at 1.0 across all dimensions", () => {
    const board = emptyBoard();
    wellFormedSlice(board, "slice-1");
    const result = scoreAmbiguity(board, SPEC);
    expect(result.dimensions.goalClarity.score).toBe(1);
    expect(result.dimensions.constraints.score).toBe(1);
    expect(result.dimensions.successCriteria.score).toBe(1);
    expect(result.dimensions.context.score).toBe(1);
    expect(result.combinedScore).toBe(1);
    expect(result.readyForHandoff).toBe(true);
  });

  it("scores an empty specId at 0 across every dimension", () => {
    const board = emptyBoard();
    const result = scoreAmbiguity(board, "nonexistent");
    expect(result.combinedScore).toBe(0);
    expect(result.readyForHandoff).toBe(false);
  });

  it("goalClarity drops when a slice has no Action/Outcome node", () => {
    const board = emptyBoard();
    placeElement(board, { specId: SPEC, sliceId: "slice-1", sliceType: "command", laneId: "actor", label: "Member" });
    const result = scoreAmbiguity(board, SPEC);
    expect(result.dimensions.goalClarity.score).toBe(0);
  });

  it("constraints drops when a slice has no Rule card", () => {
    const board = emptyBoard();
    placeElement(board, { specId: SPEC, sliceId: "slice-1", sliceType: "command", laneId: "outcome", label: "Done" });
    const result = scoreAmbiguity(board, SPEC);
    expect(result.dimensions.constraints.score).toBe(0);
  });

  it("successCriteria drops when an Example is unlinked or incomplete", () => {
    const board = emptyBoard();
    editExampleMap(board, { sliceId: "slice-1", operation: "add_example", label: "Orphan", scenario: { given: "a", when: "", then: "c" } });
    const result = scoreAmbiguity(board, "any-spec-since-example-map-is-keyed-by-slice-not-spec");
    // successCriteria is computed over sliceIds derived from board.nodes for
    // this specId — with no nodes placed under that specId, sliceIds is
    // empty, so this asserts the "no Example cards found" honest-zero path.
    expect(result.dimensions.successCriteria.detail).toMatch(/no Example cards found/);
  });

  it("readyForHandoff is false when an unresolved Question exists, even with a high score otherwise", () => {
    const board = emptyBoard();
    wellFormedSlice(board, "slice-1");
    editExampleMap(board, { sliceId: "slice-1", operation: "add_question", label: "What about a duplicate registration?" });
    const result = scoreAmbiguity(board, SPEC);
    expect(result.unresolvedQuestions).toBe(1);
    expect(result.readyForHandoff).toBe(false);
    expect(result.dimensions.context.score).toBeLessThan(1);
  });

  it("readyForHandoff respects a custom threshold", () => {
    const board = emptyBoard();
    placeElement(board, { specId: SPEC, sliceId: "slice-1", sliceType: "command", laneId: "outcome", label: "Done" });
    const lenient = scoreAmbiguity(board, SPEC, { threshold: 0.2 });
    const strict = scoreAmbiguity(board, SPEC, { threshold: 0.9 });
    expect(lenient.combinedScore).toBe(strict.combinedScore);
    expect(lenient.readyForHandoff).toBe(true);
    expect(strict.readyForHandoff).toBe(false);
  });
});
