import { useMemo, useState, type ReactNode } from "react";
import { PRESETS } from "./presets/catalog";
import { resolvePresets } from "./presets/resolver";
import { loadOverrides, saveOverrides } from "./presets/store";
import type { Overrides, PresetValue, Scope } from "./presets/types";
import { resolveTheme, type ThemeName, type Density } from "./theme";
import { PresetContext } from "./presetContext";

/** Owns the overrides (persisted to localStorage), resolves the catalog, and
 * derives the active theme from the design presets. Editing a preset in the
 * SettingsPanel flows through setOverride and re-renders every consumer. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [overrides, setOverrides] = useState<Overrides>(() => loadOverrides());

  const resolved = useMemo(() => resolvePresets(PRESETS, overrides), [overrides]);

  const theme = useMemo(() => {
    const name = String(resolved["design.theme"]?.value ?? "light") as ThemeName;
    const density = String(resolved["design.density"]?.value ?? "comfortable") as Density;
    return resolveTheme(name, density);
  }, [resolved]);

  const setOverride = (key: string, scope: Scope, value: PresetValue | undefined) => {
    setOverrides((prev) => {
      const next: Overrides = {
        org: { ...prev.org },
        project: { ...prev.project },
        user: { ...prev.user },
      };
      if (value === undefined) delete next[scope][key];
      else next[scope][key] = value;
      saveOverrides(next);
      return next;
    });
  };

  return (
    <PresetContext.Provider value={{ resolved, overrides, setOverride, theme }}>
      {children}
    </PresetContext.Provider>
  );
}
