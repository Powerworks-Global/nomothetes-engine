import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "../presetContext";

/** Small colored badge — two shapes: `pill` (count labels like "R1 E2 Q1")
 * and `dot` (the round ✓ scenario marker). Positioned by the caller via
 * `style` (absolute for node-corner badges, static for inline lists). */
export function Badge({
  children,
  background,
  title,
  variant = "pill",
  style,
}: {
  children: ReactNode;
  background: string;
  title?: string;
  variant?: "pill" | "dot";
  style?: CSSProperties;
}) {
  const theme = useTheme();
  return (
    <span
      title={title}
      style={{
        background,
        color: theme.color.badge.text,
        borderRadius: variant === "dot" ? theme.radius.round : theme.radius.pill,
        fontSize: theme.fontSize.xs,
        fontWeight: 700,
        whiteSpace: "nowrap",
        ...(variant === "dot"
          ? {
              width: 18,
              height: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }
          : { padding: "1px 6px" }),
        ...style,
      }}
    >
      {children}
    </span>
  );
}
