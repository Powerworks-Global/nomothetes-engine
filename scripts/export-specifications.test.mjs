import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exportSpecifications } from "./export-specifications.mjs";

const rejectApplicationBoard = JSON.parse(
  readFileSync(new URL("./fixtures/reject-application-example-map.json", import.meta.url), "utf8"),
);

describe("exportSpecifications", () => {
  it("defaults implementationRef and verificationStatus to null on every spec", () => {
    const { specifications } = exportSpecifications(rejectApplicationBoard, "reject-application");
    expect(specifications).toHaveLength(2);
    for (const spec of specifications) {
      expect(spec.implementationRef).toBeNull();
      expect(spec.verificationStatus).toBeNull();
    }
  });

  it("omits requirementRef when the source Example node has none (hand-built board)", () => {
    const { specifications } = exportSpecifications(rejectApplicationBoard, "reject-application");
    for (const spec of specifications) {
      expect(spec).not.toHaveProperty("requirementRef");
    }
  });

  it("carries requirementRef through unchanged when the source Example node has one (seeded board)", () => {
    const board = {
      nodes: [
        { id: "rule-1", data: { nodeType: "rule", label: "System MUST support X" } },
        {
          id: "example-1",
          data: {
            nodeType: "example",
            label: "AC-1.1",
            scenario: { given: "g", when: "w", then: "t" },
            requirementRef: { acId: "AC-1.1", frId: "FR-1" },
          },
        },
      ],
      edges: [{ source: "rule-1", target: "example-1" }],
    };
    const { specifications } = exportSpecifications(board, "slice-x");
    expect(specifications[0].requirementRef).toEqual({ acId: "AC-1.1", frId: "FR-1" });
  });
});
