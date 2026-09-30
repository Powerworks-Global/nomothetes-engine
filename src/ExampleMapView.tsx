import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { ExampleMapNode, type ExampleMapNodeData, type ExampleMapNodeType } from "./ExampleMapNode";
import { loadExampleMap, saveExampleMap, hasExampleMap } from "./exampleMapStore";
import { getSeedExampleMap } from "./loadBoard";
import { Button } from "./components/Button";
import { useTheme } from "./presetContext";
import { useI18n } from "./i18n";

const nodeTypes = { exampleMap: ExampleMapNode };

let nextId = 1;
function newNodeId() {
  return `em-${Date.now()}-${nextId++}`;
}

// WS2.5: a never-touched slice with real board-derived Rule/Example content
// (see getSeedExampleMap) opens pre-populated instead of blank — the
// autosave effect below then persists it on first render exactly as if a
// human had entered it, so it's editable/deletable like any other card from
// that point on. A slice with any saved board already, including one a user
// deliberately emptied, is never re-seeded (hasExampleMap, not "nodes.length
// === 0", is the check — those two cases look identical to loadExampleMap).
function getInitialBoard(sliceId: string) {
  if (hasExampleMap(sliceId)) return loadExampleMap(sliceId);
  return getSeedExampleMap(sliceId) ?? { nodes: [], edges: [] };
}

// The caller must remount this component on slice change (key={sliceId}) —
// state is initialized once from that slice's saved (or seeded) board
// rather than synchronized via an effect on the sliceId prop.
export function ExampleMapView({ sliceId, sliceLabel, onBack }: { sliceId: string; sliceLabel: string; onBack: () => void }) {
  const theme = useTheme();
  const { t, gwt } = useI18n();
  const [nodes, setNodes] = useState<Node[]>(() => getInitialBoard(sliceId).nodes);
  const [edges, setEdges] = useState<Edge[]>(() => getInitialBoard(sliceId).edges);
  const [selected, setSelected] = useState<Node | null>(null);

  // Persist on every change — spike-level autosave, no explicit save action.
  useEffect(() => {
    saveExampleMap(sliceId, { nodes, edges });
  }, [sliceId, nodes, edges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const removedIds = new Set(
        changes.filter((c): c is Extract<NodeChange, { type: "remove" }> => c.type === "remove").map((c) => c.id),
      );
      if (removedIds.size > 0) {
        setSelected((sel) => (sel && removedIds.has(sel.id) ? null : sel));
      }
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  const exportBoardJson = useCallback(() => {
    const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sliceId}-example-map.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [nodes, edges, sliceId]);

  const addRule = useCallback(() => {
    const label = window.prompt(t("prompt.ruleText"));
    if (!label) return;
    const id = newNodeId();
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: "exampleMap",
        position: { x: 40 + nds.length * 40, y: 40 + nds.length * 20 },
        data: { nodeType: "rule", label } as ExampleMapNodeData,
      },
    ]);
  }, [t]);

  const addChild = useCallback(
    (kind: Extract<ExampleMapNodeType, "example" | "question">) => {
      if (!selected || (selected.data as ExampleMapNodeData).nodeType !== "rule") {
        window.alert(t("prompt.selectRule"));
        return;
      }
      const label = window.prompt(kind === "example" ? t("prompt.exampleTitle") : t("prompt.questionText"));
      if (!label) return;
      const id = newNodeId();
      const parent = selected;
      const siblingCount = edges.filter((e) => e.source === parent.id).length;

      let scenario: ExampleMapNodeData["scenario"];
      if (kind === "example") {
        const given = window.prompt(`${gwt.given}?`) ?? "";
        const when = window.prompt(`${gwt.when}?`) ?? "";
        const then = window.prompt(`${gwt.then}?`) ?? "";
        scenario = { given, when, then };
      }

      setNodes((nds) => [
        ...nds,
        {
          id,
          type: "exampleMap",
          position: { x: parent.position.x + siblingCount * 240, y: parent.position.y + 160 },
          data: { nodeType: kind, label, scenario } as ExampleMapNodeData,
        },
      ]);
      setEdges((eds) => [...eds, { id: `${parent.id}-${id}`, source: parent.id, target: id }]);
    },
    [selected, edges, t, gwt],
  );

  const markAnswered = useCallback(() => {
    if (!selected || (selected.data as ExampleMapNodeData).nodeType !== "question") {
      window.alert(t("prompt.selectQuestion"));
      return;
    }
    const answer = window.prompt(`${gwt.answer}?`);
    if (!answer) return;
    const targetId = selected.id;
    const answeredAt = new Date().toISOString();
    setNodes((nds) =>
      nds.map((n) =>
        n.id === targetId
          ? { ...n, data: { ...n.data, status: "answered", answer, answeredAt } as ExampleMapNodeData }
          : n,
      ),
    );
  }, [selected, t, gwt]);

  return (
    <div style={{ width: "100vw", height: "100vh", display: "flex" }}>
      <div style={{ flex: 1, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: theme.space.lg,
            left: theme.space.lg,
            zIndex: 10,
            display: "flex",
            gap: theme.space.md,
            alignItems: "center",
            background: theme.color.surface,
            padding: `${theme.space.sm}px ${theme.space.xs + theme.space.sm}px`,
            borderRadius: theme.radius.md,
            boxShadow: theme.shadow.md,
            fontFamily: "sans-serif",
            fontSize: theme.fontSize.base,
          }}
        >
          <Button onClick={onBack}>{t("em.back")}</Button>
          <span style={{ color: theme.color.text.muted }}>{t("em.titlePrefix")}{sliceLabel}</span>
          <Button onClick={addRule}>{t("em.addRule")}</Button>
          <Button onClick={() => addChild("example")}>{t("em.addExample")}</Button>
          <Button onClick={() => addChild("question")}>{t("em.addQuestion")}</Button>
          <Button onClick={markAnswered}>{t("em.markAnswered")}</Button>
          <Button onClick={exportBoardJson}>{t("em.exportJson")}</Button>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_e, n) => setSelected(n)}
          onPaneClick={() => setSelected(null)}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}
