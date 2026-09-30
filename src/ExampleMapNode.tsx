import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useTheme } from "./presetContext";
import { useI18n } from "./i18n";
import { NodeCard } from "./components/NodeCard";

export type ExampleMapNodeType = "rule" | "example" | "question";

export type QuestionStatus = "open" | "answered";

export interface ExampleMapNodeData {
  nodeType: ExampleMapNodeType;
  label: string;
  /** Only meaningful on "example" nodes — the classic Example Mapping
   * green card is itself a Given/When/Then, same shape as the Layer 1
   * Scenario feature it's borrowed from. */
  scenario?: { given: string; when: string; then: string };
  /** Only meaningful on "question" nodes. Missing/undefined is treated as
   * "open" everywhere this is read (no migration needed for existing
   * boards saved before this field existed) — see export-stakeholder-digest.mjs. */
  status?: QuestionStatus;
  answer?: string;
  answeredAt?: string; // ISO date
  [key: string]: unknown;
}

export function ExampleMapNode({ data }: NodeProps) {
  const nodeData = data as unknown as ExampleMapNodeData;
  const theme = useTheme();
  const { gwt } = useI18n();
  const isAnsweredQuestion = nodeData.nodeType === "question" && nodeData.status === "answered";
  const card = theme.color.card[isAnsweredQuestion ? "answeredQuestion" : nodeData.nodeType];

  return (
    <NodeCard borderColor={card.border} background={card.bg} minWidth={180} maxWidth={220}>
      <Handle type="target" position={Position.Top} />
      <div
        style={{
          fontSize: theme.fontSize.xs,
          color: theme.color.text.subtle,
          marginBottom: 2,
          fontWeight: 700,
          letterSpacing: 0.5,
        }}
      >
        {card.label}
      </div>
      <div style={{ fontWeight: 600 }}>{nodeData.label}</div>
      {nodeData.nodeType === "example" && nodeData.scenario && (
        <div style={{ marginTop: theme.space.sm, fontSize: theme.fontSize.sm, lineHeight: 1.5, color: theme.color.text.exampleBody }}>
          <div><strong>{gwt.given}</strong> {nodeData.scenario.given}</div>
          <div><strong>{gwt.when}</strong> {nodeData.scenario.when}</div>
          <div><strong>{gwt.then}</strong> {nodeData.scenario.then}</div>
        </div>
      )}
      {isAnsweredQuestion && nodeData.answer && (
        <div style={{ marginTop: theme.space.sm, fontSize: theme.fontSize.sm, lineHeight: 1.5, color: theme.color.text.body }}>
          <strong>{gwt.answer}</strong> {nodeData.answer}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
    </NodeCard>
  );
}
