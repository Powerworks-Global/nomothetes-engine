// TEMPORARY demonstration that the CI traceability gate bites: two genuine
// tests of annotate-specifications.mjs behavior, tagged at the fm.gate-bite-demo
// specifications, used to show red/green CI runs. Removed after the demo.
import { describe, expect, it } from "vitest";
import { annotateSpecifications } from "./annotate-specifications.mjs";

function exported() {
  return {
    sliceId: "fm.gate-bite-demo",
    warnings: [],
    specifications: [
      { id: "spec-1", title: "A", implementationRef: null, verificationStatus: null },
      { id: "spec-2", title: "B", implementationRef: null, verificationStatus: null },
    ],
  };
}

describe("fm.gate-bite-demo", () => {
  it(
    "refuses an annotation whose id matches no specification",
    { meta: { spec: "fm.gate-bite-demo#spec-1", implementation: "scripts/annotate-specifications.mjs#annotateSpecifications" } },
    () => {
      expect(() => annotateSpecifications(exported(), { "spec-999": { implementationRef: "x" } })).toThrow(
        /does not match any specification id/,
      );
    },
  );
  it(
    "surfaces a specification left without any annotation",
    { meta: { spec: "fm.gate-bite-demo#spec-2", implementation: "scripts/annotate-specifications.mjs#annotateSpecifications" } },
    () => {
      const { warnings } = annotateSpecifications(exported(), { "spec-1": { implementationRef: "src/App.tsx#x" } });
      expect(warnings.some((w) => /spec-2.*no implementationRef or verificationStatus/.test(w))).toBe(true);
    },
  );
});
