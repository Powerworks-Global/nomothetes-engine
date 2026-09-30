import { createContext, useContext } from "react";
import type { Overrides, PresetValue, ResolvedPreset, Scope } from "./presets/types";
import type { Theme } from "./theme";

export interface PresetContextValue {
  resolved: Record<string, ResolvedPreset>;
  overrides: Overrides;
  setOverride: (key: string, scope: Scope, value: PresetValue | undefined) => void;
  theme: Theme;
}

export const PresetContext = createContext<PresetContextValue | null>(null);

export function usePresets(): PresetContextValue {
  const ctx = useContext(PresetContext);
  if (!ctx) throw new Error("usePresets must be used within a ThemeProvider");
  return ctx;
}

export function useTheme(): Theme {
  return usePresets().theme;
}
