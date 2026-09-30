import type { Overrides } from "./types";
import { EMPTY_OVERRIDES } from "./types";

// Override persistence for the spike — localStorage, matching the rest of
// the repo. A JSON config file is the eventual real shape once a backend or
// project checkout exists; this is the throwaway-MVP equivalent.

const STORAGE_KEY = "eunomia:preset-overrides";

export function loadOverrides(): Overrides {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return EMPTY_OVERRIDES;
  try {
    const parsed = JSON.parse(raw) as Partial<Overrides>;
    return {
      org: parsed.org ?? {},
      project: parsed.project ?? {},
      user: parsed.user ?? {},
    };
  } catch {
    return EMPTY_OVERRIDES;
  }
}

export function saveOverrides(overrides: Overrides): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}
