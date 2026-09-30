import type { LaneId } from "./lanes";

// Visual tokens — the substrate the design presets (theme, density) drive.
// A "theme" picks a color palette + shadow; a "density" picks a spacing/
// radius/font scale. resolveTheme(name, density) returns the active Theme.
// (In Phase 0 this was a single static `theme` object; now it's resolved
// from presets via the ThemeProvider.)

export type ThemeName = "light" | "dark" | "brand";
export type Density = "comfortable" | "compact";

export interface Theme {
  color: {
    /** One fill + border per Layer 1 lane, keyed by lane id. */
    lane: Record<LaneId, { fill: string; border: string }>;
    /** Layer 2 Example Mapping card types (Rule/Example/Question). */
    card: Record<
      "rule" | "example" | "question" | "answeredQuestion",
      { bg: string; border: string; label: string }
    >;
    badge: { info: string; danger: string; success: string; text: string };
    text: {
      muted: string;
      subtle: string;
      body: string;
      strong: string;
      exampleBody: string;
    };
    border: string;
    borderLight: string;
    surface: string;
  };
  space: { xs: number; sm: number; md: number; lg: number; xl: number };
  radius: { sm: number; md: number; pill: number; round: string };
  fontSize: { xs: number; sm: number; md: number; base: number };
  shadow: { sm: string; md: string };
}

interface Palette {
  color: Theme["color"];
  shadow: Theme["shadow"];
}

const LIGHT: Palette = {
  color: {
    lane: {
      actor: { fill: "#f4f4f5", border: "#a1a1aa" },
      screen: { fill: "#eef2ff", border: "#6366f1" },
      action: { fill: "#ecfeff", border: "#06b6d4" },
      outcome: { fill: "#fff7ed", border: "#f97316" },
      ownedData: { fill: "#f0fdf4", border: "#22c55e" },
    },
    card: {
      rule: { bg: "#fef9c3", border: "#eab308", label: "RULE" },
      example: { bg: "#dcfce7", border: "#22c55e", label: "EXAMPLE" },
      question: { bg: "#fee2e2", border: "#ef4444", label: "QUESTION" },
      answeredQuestion: { bg: "#f4f4f5", border: "#a1a1aa", label: "QUESTION — ANSWERED" },
    },
    badge: { info: "#3b82f6", danger: "#ef4444", success: "#22c55e", text: "white" },
    text: {
      muted: "#71717a",
      subtle: "#52525b",
      body: "#3f3f46",
      strong: "#08060d",
      exampleBody: "#166534",
    },
    border: "#e4e4e7",
    borderLight: "#f4f4f5",
    surface: "white",
  },
  shadow: { sm: "0 1px 2px rgba(0,0,0,0.08)", md: "0 1px 4px rgba(0,0,0,0.15)" },
};

const DARK: Palette = {
  color: {
    lane: {
      actor: { fill: "#27272a", border: "#a1a1aa" },
      screen: { fill: "#1e1b4b", border: "#818cf8" },
      action: { fill: "#083344", border: "#22d3ee" },
      outcome: { fill: "#431407", border: "#fb923c" },
      ownedData: { fill: "#052e16", border: "#4ade80" },
    },
    card: {
      rule: { bg: "#422006", border: "#facc15", label: "RULE" },
      example: { bg: "#052e16", border: "#4ade80", label: "EXAMPLE" },
      question: { bg: "#450a0a", border: "#f87171", label: "QUESTION" },
      answeredQuestion: { bg: "#27272a", border: "#71717a", label: "QUESTION — ANSWERED" },
    },
    badge: { info: "#3b82f6", danger: "#ef4444", success: "#22c55e", text: "white" },
    text: {
      muted: "#a1a1aa",
      subtle: "#d4d4d8",
      body: "#d4d4d8",
      strong: "#fafafa",
      exampleBody: "#86efac",
    },
    border: "#3f3f46",
    borderLight: "#27272a",
    surface: "#18181b",
  },
  shadow: { sm: "0 1px 2px rgba(0,0,0,0.4)", md: "0 1px 4px rgba(0,0,0,0.5)" },
};

// "brand" is a placeholder for now — light palette with a distinct accent is
// future work; it must not silently render as light, so it's a clone flagged
// as TODO in the preset's own notes rather than a third hand-built palette.
const BRAND: Palette = LIGHT;

const SCALES: Record<Density, Pick<Theme, "space" | "radius" | "fontSize">> = {
  comfortable: {
    space: { xs: 4, sm: 6, md: 8, lg: 12, xl: 16 },
    radius: { sm: 4, md: 6, pill: 9, round: "50%" },
    fontSize: { xs: 10, sm: 11, md: 12, base: 13 },
  },
  compact: {
    space: { xs: 2, sm: 4, md: 6, lg: 8, xl: 12 },
    radius: { sm: 3, md: 4, pill: 8, round: "50%" },
    fontSize: { xs: 9, sm: 10, md: 11, base: 12 },
  },
};

const PALETTES: Record<ThemeName, Palette> = { light: LIGHT, dark: DARK, brand: BRAND };

export function resolveTheme(name: ThemeName, density: Density): Theme {
  const palette = PALETTES[name] ?? LIGHT;
  const scale = SCALES[density] ?? SCALES.comfortable;
  return { color: palette.color, shadow: palette.shadow, ...scale };
}
