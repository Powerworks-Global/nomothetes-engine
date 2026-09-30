// Preset system — core types. See docs in the vault note "Preset System Design"
// and the catalog in ./catalog.ts. A preset is an opinionated default with
// constrained overrides, resolved default → org → project → user.

export type PresetValue = string | number | boolean | string[];

export type Scope = "org" | "project" | "user";

export type PresetGroup =
  | "language"
  | "ideation"
  | "org"
  | "vcs"
  | "modeling"
  | "design"
  | "testing"
  | "integration"
  | "customer"
  | "communication"
  | "deploy"
  | "handover"
  | "agent";

export interface PresetDefinition {
  key: string;
  group: PresetGroup;
  label: string;
  default: PresetValue;
  /** Constrained override options (string-valued presets only). Omit = free-form. */
  allowed?: string[];
  /** Locked presets ignore all overrides (e.g. code language is always English). */
  locked?: boolean;
  /** When not explicitly overridden, follow another preset's resolved value. */
  derivedFrom?: string;
  derive?: (base: PresetValue) => PresetValue;
  scope: Scope;
}

export interface ResolvedPreset {
  key: string;
  value: PresetValue;
  source: "default" | "org" | "project" | "user" | "derived";
}

/** Explicit overrides, bucketed by scope (later scope wins on resolution). */
export interface Overrides {
  org: Record<string, PresetValue>;
  project: Record<string, PresetValue>;
  user: Record<string, PresetValue>;
}

export const EMPTY_OVERRIDES: Overrides = { org: {}, project: {}, user: {} };
