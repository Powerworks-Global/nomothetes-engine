import { LANES, TOTAL_HEIGHT } from "./lanes";
import { useTheme } from "./presetContext";

/** Renders the fixed lane bands + labels behind the React Flow canvas.
 * This is the "swimlane" visual — plain absolutely-positioned divs, not
 * a React Flow primitive, since lanes aren't built into the library. */
export function LaneBackground({ width }: { width: number }) {
  const theme = useTheme();
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width, height: TOTAL_HEIGHT, pointerEvents: "none", zIndex: 0 }}>
      {LANES.map((lane) => (
        <div
          key={lane.id}
          style={{
            position: "absolute",
            top: lane.yCenter - lane.height / 2,
            left: 0,
            width,
            height: lane.height,
            background: theme.color.lane[lane.id].fill,
            borderBottom: `1px solid ${theme.color.border}`,
          }}
        >
          <span
            style={{
              position: "sticky",
              left: theme.space.md,
              top: theme.space.md,
              fontSize: theme.fontSize.sm,
              fontWeight: 700,
              color: theme.color.text.subtle,
              letterSpacing: 0.5,
            }}
          >
            {lane.label}
          </span>
        </div>
      ))}
    </div>
  );
}
