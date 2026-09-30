import { describe, expect, it } from "vitest";
import { buildBootstrapPlan, shouldRefuse } from "./bootstrap.mjs";

describe("buildBootstrapPlan", () => {
  it("builds a config using the existing preset shape (org/project/user)", () => {
    const plan = buildBootstrapPlan({
      projectName: "My New Project",
      vcsProvider: "github",
      targetStack: "react-node",
      autonomyLevel: "write-with-review",
    });
    expect(plan.projectName).toBe("My New Project");
    expect(plan.packageName).toBe("my-new-project");
    expect(plan.config).toEqual({
      org: { "vcs.provider": "github" },
      project: { "integration.targetStack": "react-node", "agent.autonomyLevel": "write-with-review" },
      user: {},
    });
  });

  it("rejects an empty project name", () => {
    expect(() =>
      buildBootstrapPlan({ projectName: "  ", vcsProvider: "github", targetStack: "react-node", autonomyLevel: "autonomous" }),
    ).toThrow("projectName is required");
  });

  it("rejects a vcsProvider outside the catalog's allowed list", () => {
    expect(() =>
      buildBootstrapPlan({ projectName: "x", vcsProvider: "perforce", targetStack: "react-node", autonomyLevel: "autonomous" }),
    ).toThrow(/vcs\.provider/);
  });

  it("rejects a targetStack outside the catalog's allowed list", () => {
    expect(() =>
      buildBootstrapPlan({ projectName: "x", vcsProvider: "github", targetStack: "cobol-mainframe", autonomyLevel: "autonomous" }),
    ).toThrow(/integration\.targetStack/);
  });

  it("rejects an autonomyLevel outside the catalog's allowed list", () => {
    expect(() =>
      buildBootstrapPlan({ projectName: "x", vcsProvider: "github", targetStack: "react-node", autonomyLevel: "god-mode" }),
    ).toThrow(/agent\.autonomyLevel/);
  });

  it("slugifies unusual project names into a safe package name", () => {
    const plan = buildBootstrapPlan({
      projectName: "  Café's Project! 2.0  ",
      vcsProvider: "github",
      targetStack: "react-node",
      autonomyLevel: "read-only",
    });
    expect(plan.packageName).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("shouldRefuse", () => {
  it("allows 0 commits (fresh git init)", () => {
    expect(shouldRefuse(0)).toBe(false);
  });

  it("allows exactly 1 commit (a template-copy starting point)", () => {
    expect(shouldRefuse(1)).toBe(false);
  });

  it("refuses 2 or more commits (real existing history)", () => {
    expect(shouldRefuse(2)).toBe(true);
    expect(shouldRefuse(50)).toBe(true);
  });
});
