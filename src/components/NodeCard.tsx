import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "../presetContext";

/** Base card wrapper for canvas nodes — the shared border/radius/padding/
 * shadow treatment both Layer 1 nodes and Layer 2 Example Map cards build on.
 * Border and background are explicit props because they're semantic (lane
 * color vs card-type color); the rest comes from the active theme. */
export function NodeCard({
  children,
  borderColor,
  background,
  title,
  minWidth = 160,
  maxWidth,
  style,
}: {
  children: ReactNode;
  borderColor: string;
  background?: string;
  title?: string;
  minWidth?: number;
  maxWidth?: number;
  style?: CSSProperties;
}) {
  const theme = useTheme();
  return (
    <div
      title={title}
      style={{
        border: `2px solid ${borderColor}`,
        borderRadius: theme.radius.md,
        padding: `${theme.space.md}px ${theme.space.lg}px`,
        background: background ?? theme.color.surface,
        minWidth,
        ...(maxWidth ? { maxWidth } : {}),
        fontSize: theme.fontSize.base,
        boxShadow: theme.shadow.sm,
        position: "relative",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
