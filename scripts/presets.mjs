// Shared preset loader for the CLI exporters. Imports the TS catalog +
// resolver directly (Node 22.23+ strips types natively, no flag needed),
// so there is ONE source of truth for presets across the browser app and
// the CLI — no duplication. See src/presets/catalog.ts and resolver.ts.

import { existsSync, readFileSync } from "node:fs";
import { PRESETS } from "../src/presets/catalog.ts";
import { resolvePresets } from "../src/presets/resolver.ts";

/**
 * Load and resolve presets from an optional overrides JSON file (the
 * `{ org, project, user }` shape from src/presets/store.ts). Returns a flat
 * key -> value map of RESOLVED presets (defaults filled in, locked/derived
 * applied). Pass `null`/`undefined` for all-defaults.
 */
export function loadResolvedPresets(configPath) {
  let overrides = { org: {}, project: {}, user: {} };
  if (configPath) {
    if (!existsSync(configPath)) {
      throw new Error(`Preset config not found: ${configPath}`);
    }
    const raw = JSON.parse(readFileSync(configPath, "utf8"));
    overrides = {
      org: raw.org ?? {},
      project: raw.project ?? {},
      user: raw.user ?? {},
    };
  }
  const resolved = resolvePresets(PRESETS, overrides);
  const flat = {};
  for (const [key, entry] of Object.entries(resolved)) {
    flat[key] = entry.value;
  }
  return flat;
}
