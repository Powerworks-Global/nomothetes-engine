import type { Overrides, PresetDefinition, PresetValue, ResolvedPreset } from "./types";

/** Resolve the catalog against explicit overrides.
 *
 * Order: defaults → org → project → user (later wins). Locked presets ignore
 * every override. Derived presets (derivedFrom + derive) are computed only
 * when the key is still at its default after all scopes — an explicit
 * override of the derived key itself wins over the derivation. */
export function resolvePresets(defs: PresetDefinition[], overrides: Overrides): Record<string, ResolvedPreset> {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const result: Record<string, ResolvedPreset> = {};

  for (const d of defs) {
    result[d.key] = { key: d.key, value: d.default, source: "default" };
  }

  const scopes = ["org", "project", "user"] as const;
  for (const scope of scopes) {
    for (const [key, value] of Object.entries(overrides[scope])) {
      const def = byKey.get(key);
      if (!def || def.locked) continue; // unknown keys and locked presets are ignored
      result[key] = { key, value, source: scope };
    }
  }

  for (const d of defs) {
    if (d.derivedFrom && d.derive && result[d.key].source === "default") {
      result[d.key] = { key: d.key, value: d.derive(result[d.derivedFrom].value), source: "derived" };
    }
  }

  return result;
}

/** Apply a preset bundle to existing overrides without clobbering — values
 * the caller has already set explicitly win; the bundle only fills gaps.
 * This is the "never re-seed over a user's deliberate edit" rule from the
 * design note, applied at the override level. */
export function mergeOverrides(
  existing: Record<string, PresetValue>,
  incoming: Record<string, PresetValue>,
): Record<string, PresetValue> {
  return { ...incoming, ...existing };
}
