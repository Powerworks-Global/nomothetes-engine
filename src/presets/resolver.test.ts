import { describe, expect, it } from "vitest";
import { PRESETS } from "./catalog";
import { mergeOverrides, resolvePresets } from "./resolver";
import type { Overrides } from "./types";
import { EMPTY_OVERRIDES } from "./types";

function find(key: string) {
  const def = PRESETS.find((p) => p.key === key);
  if (!def) throw new Error(`preset not found: ${key}`);
  return def;
}

describe("resolvePresets", () => {
  it("resolves every preset to its default value", () => {
    const resolved = resolvePresets(PRESETS, EMPTY_OVERRIDES);
    expect(Object.keys(resolved)).toHaveLength(PRESETS.length);
    for (const def of PRESETS) {
      // Derived presets' default equals their derived value at the default
      // base (e.g. ciProvider default "github-actions" == derive(github)),
      // so the value assertion holds uniformly.
      expect(resolved[def.key].value).toEqual(def.default);
    }
  });

  it("resolves scope precedence user > project > org > default", () => {
    const overrides: Overrides = {
      org: { "customer.currency": "EUR" },
      project: { "customer.currency": "GBP" },
      user: { "customer.currency": "USD" },
    };
    const resolved = resolvePresets(PRESETS, overrides);
    expect(resolved["customer.currency"].value).toBe("USD");
    expect(resolved["customer.currency"].source).toBe("user");
  });

  it("applies a lower scope when no higher scope overrides it", () => {
    const overrides: Overrides = {
      org: { "customer.currency": "EUR" },
      project: {},
      user: {},
    };
    const resolved = resolvePresets(PRESETS, overrides);
    expect(resolved["customer.currency"].value).toBe("EUR");
    expect(resolved["customer.currency"].source).toBe("org");
  });

  it("ignores overrides for locked presets", () => {
    const def = find("language.code");
    expect(def.locked).toBe(true);
    const overrides: Overrides = { org: {}, project: { "language.code": "german" }, user: {} };
    const resolved = resolvePresets(PRESETS, overrides);
    expect(resolved["language.code"].value).toBe("english");
    expect(resolved["language.code"].source).toBe("default");
  });

  it("derives a preset from its base by default", () => {
    const resolved = resolvePresets(PRESETS, EMPTY_OVERRIDES);
    expect(resolved["vcs.ciProvider"].value).toBe("github-actions");
    expect(resolved["vcs.ciProvider"].source).toBe("derived");
    expect(resolved["testing.framework"].value).toBe("xunit"); // cratis-net → xunit
  });

  it("re-derives a preset when its base is overridden", () => {
    const overrides: Overrides = { org: { "vcs.provider": "gitlab" }, project: {}, user: {} };
    const resolved = resolvePresets(PRESETS, overrides);
    expect(resolved["vcs.ciProvider"].value).toBe("gitlab-ci");
    expect(resolved["vcs.ciProvider"].source).toBe("derived");
  });

  it("lets an explicit override of the derived key win over the derivation", () => {
    const overrides: Overrides = { org: {}, project: { "vcs.ciProvider": "jenkins" }, user: {} };
    const resolved = resolvePresets(PRESETS, overrides);
    expect(resolved["vcs.ciProvider"].value).toBe("jenkins");
    expect(resolved["vcs.ciProvider"].source).toBe("project");
  });

  it("ignores override keys that aren't in the catalog", () => {
    const overrides: Overrides = { org: {}, project: { "not.a.real.preset": "x" }, user: {} };
    const resolved = resolvePresets(PRESETS, overrides);
    expect(resolved["not.a.real.preset"]).toBeUndefined();
  });
});

describe("mergeOverrides", () => {
  it("fills gaps without clobbering existing explicit values", () => {
    const existing = { "vcs.provider": "gitlab" };
    const incoming = { "vcs.provider": "github", "deploy.hosting": "firebase" };
    expect(mergeOverrides(existing, incoming)).toEqual({
      "vcs.provider": "gitlab",
      "deploy.hosting": "firebase",
    });
  });
});
