import { Handle, Position, type NodeProps } from "@xyflow/react";
import { LANES, type LaneId } from "./lanes";
import { useTheme } from "./presetContext";
import { useI18n } from "./i18n";
import { NodeCard } from "./components/NodeCard";
import { Badge } from "./components/Badge";

export interface StoryboardNodeData {
  label: string;
  laneId: LaneId;
  /** Every node in a slice's column shares this — needed by the Layer 1
   * drill-down UI (double-click → that slice's Example Map). */
  sliceId: string;
  /** Given/When/Then scenario attached to this element — the "Scenarios"
   * feature borrowed from eventmodelers.ai: any element, not just a
   * drill-down slice board, can carry an inline behavioral spec. */
  scenario?: { given: string; when: string; then: string };
  /** Layer 2 (Example Map) card counts for this node's slice, computed in
   * App.tsx from exampleMapStore — undefined/all-zero means nothing mapped
   * yet, distinct from the green Layer-1-scenario checkmark below. */
  exampleMapSummary?: { rules: number; examples: number; questions: number; openQuestions: number };
  [key: string]: unknown;
}

export function StoryboardNode({ data }: NodeProps) {
  const nodeData = data as unknown as StoryboardNodeData;
  const theme = useTheme();
  const { gwt } = useI18n();
  const lane = LANES.find((l) => l.id === nodeData.laneId);
  const hasScenario = Boolean(nodeData.scenario);
  const mapSummary = nodeData.exampleMapSummary;
  const hasExampleMap = Boolean(mapSummary && (mapSummary.rules || mapSummary.examples || mapSummary.questions));

  return (
    <NodeCard
      borderColor={theme.color.lane[nodeData.laneId].border}
      title={hasExampleMap ? undefined : "Double-click to open this slice's Example Map"}
    >
      <Handle type="target" position={Position.Left} />
      <div style={{ fontSize: theme.fontSize.xs, color: theme.color.text.muted, marginBottom: 2 }}>{lane?.label}</div>
      <div style={{ fontWeight: 600 }}>{nodeData.label}</div>
      {hasExampleMap && mapSummary && (
        <Badge
          background={mapSummary.openQuestions ? theme.color.badge.danger : theme.color.badge.info}
          title={
            `Example Map: ${mapSummary.rules} Rule${mapSummary.rules === 1 ? "" : "s"}, ` +
            `${mapSummary.examples} Example${mapSummary.examples === 1 ? "" : "s"}, ` +
            `${mapSummary.questions} Question${mapSummary.questions === 1 ? "" : "s"}` +
            (mapSummary.openQuestions ? ` (${mapSummary.openQuestions} open)` : "") +
            " — double-click to open"
          }
          style={{ position: "absolute", bottom: -8, left: -8 }}
        >
          R{mapSummary.rules} E{mapSummary.examples} Q{mapSummary.questions}
        </Badge>
      )}
      {hasScenario && (
        <Badge
          variant="dot"
          background={theme.color.badge.success}
          title={`${gwt.given} ${nodeData.scenario!.given}\n${gwt.when} ${nodeData.scenario!.when}\n${gwt.then} ${nodeData.scenario!.then}`}
          style={{ position: "absolute", top: -8, right: -8 }}
        >
          ✓
        </Badge>
      )}
      <Handle type="source" position={Position.Right} />
    </NodeCard>
  );
}
