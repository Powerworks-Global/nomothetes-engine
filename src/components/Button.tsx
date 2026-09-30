import type { CSSProperties, ReactNode } from "react";
import { useTheme } from "../presetContext";

/** Minimal button primitive — normalizes the base look across the side panel
 * and the Example Map toolbar so "add", "back", and "export" actions read as
 * one family instead of ad-hoc `<button>` styling. */
export function Button({
  children,
  onClick,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  const theme = useTheme();
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: theme.fontSize.sm,
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
