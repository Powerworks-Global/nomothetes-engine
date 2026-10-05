import { describe, expect, it } from "vitest";
import { annotateSpecifications } from "./annotate-specifications.mjs";

function exported() {
  return {
    sliceId: "slice-x",
    warnings: [],
    specifications: [
      { id: "spec-1", title: "A", given: "g", when: "w", then: "t", sourceExampleId: "e1", implementationRef: null, verificationStatus: null },
      { id: "spec-2", title: "B", given: "g", when: "w", then: "t", sourceExampleId: "e2", implementationRef: null, verificationStatus: null },
    ],
  };
}

describe("annotateSpecifications", () => {
  it("merges implementationRef and verificationStatus onto the matching spec", () => {
    const { result } = annotateSpecifications(exported(), {
      "spec-1": {
        implementationRef: "src/foo.py#bar",
        verificationStatus: { state: "passed", testRef: "tests/test_foo.py::test_bar" },
      },
    });
    expect(result.specifications[0].implementationRef).toBe("src/foo.py#bar");
    expect(result.specifications[0].verificationStatus).toEqual({ state: "passed", testRef: "tests/test_foo.py::test_bar" });
    // Untouched spec stays null.
    expect(result.specifications[1].implementationRef).toBeNull();
  });

  it("allows annotating just one of the two fields", () => {
    const { result } = annotateSpecifications(exported(), {
      "spec-1": { implementationRef: "src/foo.py#bar" },
    });
    expect(result.specifications[0].implementationRef).toBe("src/foo.py#bar");
    expect(result.specifications[0].verificationStatus).toBeNull();
  });

  it("refuses an annotation id that doesn't match any spec", () => {
    expect(() => annotateSpecifications(exported(), { "spec-999": { implementationRef: "x" } })).toThrow(
      /does not match any specification id/,
    );
  });

  it("refuses an invalid verificationStatus.state", () => {
    expect(() =>
      annotateSpecifications(exported(), { "spec-1": { verificationStatus: { state: "maybe" } } }),
    ).toThrow(/verificationStatus\.state must be one of/);
  });

  it("warns about specs left fully unannotated", () => {
    const { warnings } = annotateSpecifications(exported(), {
      "spec-1": { implementationRef: "src/foo.py#bar" },
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/spec-2/);
  });
});
