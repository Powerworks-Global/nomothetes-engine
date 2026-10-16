import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { gateViolations, deriveAnnotations } from "./derive-annotations.mjs";

// Fixtures mirror the real `vitest run --reporter=json` shape verified against
// vitest 5.0.0 output: testResults[].{name, assertionResults[].{fullName,
// status, meta}}. testRef paths come out relative to the checkout.

function report(startTime, ...assertions) {
  return {
    startTime,
    testResults: [
      {
        name: resolve(process.cwd(), "tests/slice-deletion.test.ts"),
        assertionResults: assertions.map((a) => ({
          fullName: a.full,
          status: a.status,
          meta: a.meta,
        })),
      },
    ],
  };
}

function document() {
  return {
    sliceId: "storyboard-canvas-self.delete-slice",
    specifications: [
      { id: "spec-1", title: "Deleting a slice with only internal edges", implementationRef: null, verificationStatus: null },
      { id: "spec-2", title: "Deleting a slice with a cross-slice edge", implementationRef: null, verificationStatus: null },
    ],
  };
}

const TAG1 = {
  spec: "storyboard-canvas-self.delete-slice#spec-1",
  implementation: "src/App.tsx#deleteSlice",
};

describe("deriveAnnotations", () => {
  it("derives a passed annotation from a passing tagged test in the report", () => {
    const { annotations } = deriveAnnotations({
      report: report(1792000000000, { full: "removes the slice's nodes", status: "passed", meta: TAG1 }),
      document: document(),
    });
    expect(annotations["spec-1"]).toEqual({
      implementationRef: "src/App.tsx#deleteSlice",
      verificationStatus: {
        state: "passed",
        testRef: "tests/slice-deletion.test.ts > removes the slice's nodes",
        lastRunAt: new Date(1792000000000).toISOString(),
      },
    });
    // Untagged spec gets no annotation — absence is data, not a guess.
    expect(annotations["spec-2"]).toBeUndefined();
  });

  it("marks failed when the tagged test failed, not_run when it was skipped", () => {
    const failed = deriveAnnotations({
      report: report(1, { full: "t", status: "failed", meta: TAG1 }),
      document: document(),
    });
    expect(failed.annotations["spec-1"].verificationStatus.state).toBe("failed");

    const skipped = deriveAnnotations({
      report: report(1, { full: "t", status: "skipped", meta: TAG1 }),
      document: document(),
    });
    expect(skipped.annotations["spec-1"].verificationStatus.state).toBe("not_run");
  });

  it("aggregates multiple tagged tests per spec: any failure wins, testRefs are sorted and joined", () => {
    const { annotations } = deriveAnnotations({
      report: report(
        1,
        { full: "zzz second test", status: "passed", meta: TAG1 },
        { full: "a fails", status: "failed", meta: TAG1 },
        { full: "a second check", status: "passed", meta: TAG1 },
      ),
      document: document(),
    });
    expect(annotations["spec-1"].verificationStatus.state).toBe("failed");
    expect(annotations["spec-1"].verificationStatus.testRef).toBe(
      "tests/slice-deletion.test.ts > a fails; tests/slice-deletion.test.ts > a second check; tests/slice-deletion.test.ts > zzz second test",
    );
  });

  it("ignores tags belonging to another slice's specification document", () => {
    const { annotations, foreignTagCount } = deriveAnnotations({
      report: report(1, {
        full: "t",
        status: "passed",
        meta: { spec: "other.slice#spec-1", implementation: "src/App.tsx#deleteSlice" },
      }),
      document: document(),
    });
    expect(Object.keys(annotations)).toEqual([]);
    expect(foreignTagCount).toBe(1);
  });

  it("refuses a tag naming a spec id this document doesn't have (typo guard)", () => {
    expect(() =>
      deriveAnnotations({
        report: report(1, { full: "t", status: "passed", meta: { spec: "storyboard-canvas-self.delete-slice#spec-99" } }),
        document: document(),
      }),
    ).toThrow(/is not an id in storyboard-canvas-self\.delete-slice/);
  });

  it("refuses a meta.spec that isn't a '<sliceId>#<specId>' string", () => {
    expect(() =>
      deriveAnnotations({
        report: report(1, { full: "t", status: "passed", meta: { spec: 42 } }),
        document: document(),
      }),
    ).toThrow(/must be the string "<sliceId>#<specId>"/);
  });

  it("refuses an implementationRef naming a file that doesn't exist in the checkout", () => {
    expect(() =>
      deriveAnnotations({
        report: report(1, {
          full: "t",
          status: "passed",
          meta: { spec: "storyboard-canvas-self.delete-slice#spec-1", implementation: "src/DefinitelyMissing.tsx#nope" },
        }),
        document: document(),
      }),
    ).toThrow(/does not exist in this checkout/);
  });

  it("refuses two tagged tests naming different implementations for the same spec", () => {
    expect(() =>
      deriveAnnotations({
        report: report(
          1,
          { full: "a", status: "passed", meta: TAG1 },
          { full: "b", status: "passed", meta: { spec: "storyboard-canvas-self.delete-slice#spec-1", implementation: "src/lanes.ts#buildLanes" } },
        ),
        document: document(),
      }),
    ).toThrow(/must agree/);
  });
});

describe("gateViolations", () => {
  it("names every specification with no annotation", () => {
    const v = gateViolations({ document: document(), annotations: {} });
    expect(v).toHaveLength(2);
    expect(v[0]).toMatch(/GATE FAIL spec-1 .* no test in this run declares it/);
    expect(v[1]).toMatch(/GATE FAIL spec-2/);
  });

  it("returns no violations when every specification has a passed annotation with an implementationRef", () => {
    const v = gateViolations({
      document: document(),
      annotations: {
        "spec-1": { implementationRef: "src/App.tsx#deleteSlice", verificationStatus: { state: "passed", testRef: "t1", lastRunAt: "x" } },
        "spec-2": { implementationRef: "src/App.tsx#deleteSlice", verificationStatus: { state: "passed", testRef: "t2", lastRunAt: "x" } },
      },
    });
    expect(v).toEqual([]);
  });

  it("fails a passed-but-implementation-less annotation and a failed-state one", () => {
    const v = gateViolations({
      document: document(),
      annotations: {
        "spec-1": { verificationStatus: { state: "passed", testRef: "t", lastRunAt: "x" } },
        "spec-2": {
          implementationRef: "src/App.tsx#deleteSlice",
          verificationStatus: { state: "failed", testRef: "t2", lastRunAt: "x" },
        },
      },
    });
    expect(v).toHaveLength(2);
    expect(v[0]).toMatch(/declare no meta\.implementation/);
    expect(v[1]).toMatch(/verification state is "failed", not "passed"/);
  });
});
