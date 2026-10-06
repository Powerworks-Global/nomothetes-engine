import { useCallback, useState } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Connection,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { LaneBackground } from "./LaneBackground";
import { LANES, snapYToLane, TOTAL_HEIGHT, type LaneId } from "./lanes";
import { StoryboardNode, type StoryboardNodeData } from "./StoryboardNode";
import { listSpecs, loadSpec, listCrossCuttingConcerns, setActiveBoard, COLUMN_WIDTH, type CrossCuttingConcern, type SliceSummary } from "./loadBoard";
import { BOARD_SOURCES, DEFAULT_BOARD_ID } from "./boards/registry";
import { ExampleMapView } from "./ExampleMapView";
import { getExampleMapSummary } from "./exampleMapStore";
import { Badge } from "./components/Badge";
import { Button } from "./components/Button";
import { SettingsPanel } from "./components/SettingsPanel";
import { useTheme } from "./presetContext";
import { useI18n } from "./i18n";

const CANVAS_WIDTH = 2400;

const nodeTypes = { storyboard: StoryboardNode };

// Same shape as ExampleMapView.tsx's newNodeId() — a per-file module-level
// counter, not extracted to a shared util for one function.
let nextStoryboardNodeId = 1;
function newStoryboardNodeId() {
  return `storyboard-${Date.now()}-${nextStoryboardNodeId++}`;
}

// No bundled board (docs/adr/0005) — starts blank; a facilitator builds
// the real content up live, or a future board source reaches an
// external project's own repo (see src/boards/registry.ts).
export default function App() {
  const [selectedBoardId, setSelectedBoardId] = useState<string>(DEFAULT_BOARD_ID);
  // Recomputed on every render, same as `slices`/`concerns` below — cheap,
  // and must reflect whichever board is currently active rather than being
  // frozen at module-eval time (that's what made a board-source picker
  // impossible before: `specs` used to be a module-level constant read
  // once, before any board could ever change).
  const specs = listSpecs();
  const [selectedSpec, setSelectedSpec] = useState<string>(specs[0]);
  const initial = loadSpec(selectedSpec);
  const [nodes, setNodes] = useState<Node[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [selected, setSelected] = useState<Node | null>(null);
  const [openSliceId, setOpenSliceId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [expandedConcernId, setExpandedConcernId] = useState<string | null>(null);
  // Load-by-ID input state (for boards written to src/data/<id>-board.json
  // by external tools like the Interview harness). Kept additive and local.
  const [loadBoardId, setLoadBoardId] = useState<string>("");
  const [loadBoardError, setLoadBoardError] = useState<string | null>(null);
  const [loadingBoard, setLoadingBoard] = useState<boolean>(false);
  // Derived from live `nodes` state, NOT listSlices(selectedSpec) (which
  // reads the static loaded board data). `nodes` is already always exactly
  // "the current spec's nodes" (set by loadSpec/changeSpec/changeBoard),
  // so this is identical output for anything imported — but it also
  // naturally includes authored nodes, which listSlices() could never see
  // since they only ever exist in this React state, not the static board.
  const slices: SliceSummary[] = (() => {
    const seen = new Set<string>();
    const order: SliceSummary[] = [];
    for (const n of nodes) {
      const d = n.data as StoryboardNodeData;
      if (seen.has(d.sliceId)) continue;
      seen.add(d.sliceId);
      const screenNode = nodes.find(
        (m) => (m.data as StoryboardNodeData).sliceId === d.sliceId && (m.data as StoryboardNodeData).laneId === "screen",
      );
      order.push({ sliceId: d.sliceId, label: ((screenNode?.data ?? d) as StoryboardNodeData).label });
    }
    return order;
  })();
  // Board-wide, not slice-scoped — recomputed fresh each render like
  // `slices` above, not memoized (same reasoning: cheap, low cardinality).
  const concerns = listCrossCuttingConcerns();
  const theme = useTheme();
  const { t, gwt } = useI18n();

  // Recomputed on every render — including whenever openSliceId flips back
  // to null (returning from an Example Map edit) — so badges/counts stay
  // live without a second state-sync mechanism. Plain computation, not
  // memoized: slice counts here are single/low-digit, not worth the
  // memoization bookkeeping.
  const exampleMapSummaries = Object.fromEntries(
    slices.map((s) => [s.sliceId, getExampleMapSummary(s.sliceId)]),
  );

  const displayNodes = nodes.map((n) => ({
    ...n,
    data: { ...n.data, exampleMapSummary: exampleMapSummaries[(n.data as StoryboardNodeData).sliceId] },
  }));

  const changeSpec = useCallback((specId: string) => {
    setSelectedSpec(specId);
    const { nodes: n, edges: e } = loadSpec(specId);
    setNodes(n);
    setEdges(e);
    setSelected(null);
  }, []);

  // Switching boards is synchronous today (every BoardSource.load() in
  // the registry returns an ImportedBoard directly, not a Promise) — no
  // loading state needed. A future async source (upload/MCP) would need
  // this to handle a Promise too; not built now, see src/boards/types.ts.
  const changeBoard = useCallback((boardId: string) => {
    const source = BOARD_SOURCES.find((b) => b.id === boardId);
    if (!source) return;
    setActiveBoard(source.load());
    setSelectedBoardId(boardId);
    const specsForBoard = listSpecs();
    const nextSpec = specsForBoard[0];
    setSelectedSpec(nextSpec);
    const { nodes: n, edges: e } = loadSpec(nextSpec);
    setNodes(n);
    setEdges(e);
    setSelected(null);
    setOpenSliceId(null);
    setExpandedConcernId(null);
  }, [setOpenSliceId, setExpandedConcernId]);

  // Attempt to load a board JSON directly from src/data/<id>-board.json.
  // Uses the same post-load steps as changeBoard (setActiveBoard, pick
  // first spec, loadSpec into nodes/edges) but does a dynamic import so
  // it can handle boards not declared in BOARD_SOURCES. Errors are shown
  // inline and do not crash the app.
  const loadBoardById = useCallback(
    async (id: string) => {
      setLoadBoardError(null);
      if (!id) return;
      setLoadingBoard(true);
      try {
        // Dynamic import resolves to a module with a default export (the
        // JSON). This mirrors the shape of the statically imported boards.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        const mod: any = await import(/* @vite-ignore */ `./data/${id}-board.json`);
        const importedBoard = mod?.default ?? mod;
        // Set active board for loadBoard/listSpecs/loadSpec to see.
        setActiveBoard(importedBoard);
        setSelectedBoardId(id);

        const specsForBoard = listSpecs();
        const nextSpec = specsForBoard[0];
        if (!nextSpec) {
          // Board loaded but has no specs — clear canvas.
          setSelectedSpec("");
          setNodes([]);
          setEdges([]);
          setSelected(null);
          setOpenSliceId(null);
          setExpandedConcernId(null);
          setLoadBoardError(null);
          return;
        }
        setSelectedSpec(nextSpec);
        const { nodes: n, edges: e } = loadSpec(nextSpec);
        setNodes(n);
        setEdges(e);
        setSelected(null);
        setOpenSliceId(null);
        setExpandedConcernId(null);
      } catch (err) {
        // Keep message simple and user-facing; do not throw.
        setLoadBoardError(`Failed to load board "${id}"`);
      } finally {
        setLoadingBoard(false);
      }
    },
    [setNodes, setEdges, setSelected, setOpenSliceId, setExpandedConcernId, setSelectedSpec],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );

  // The actual swimlane spike: on drag stop, snap the node's Y back to
  // its nearest lane center (X stays free, so time-ordering within a
  // lane is preserved) and update its laneId so the label/border re-styles.
  const onNodeDragStop = useCallback((_evt: MouseEvent | TouchEvent, draggedNode: Node) => {
    const { laneId, y } = snapYToLane(draggedNode.position.y + 30);
    setNodes((nds) =>
      nds.map((n) =>
        n.id === draggedNode.id
          ? { ...n, position: { ...n.position, y: y - 30 }, data: { ...n.data, laneId } }
          : n,
      ),
    );
  }, []);

  // Layer 1 authoring — mirrors ExampleMapView.tsx's addRule prompt flow
  // exactly (label prompt, empty/cancelled -> no-op) rather than inventing
  // a new interaction pattern. Slice id is explicit input, never guessed —
  // matches this project's own "don't guess" discipline. Position mirrors
  // loadSpec's own column-per-slice-in-order-of-first-appearance layout:
  // aligns with existing nodes sharing that slice if one exists, otherwise
  // becomes the next column.
  const addStoryboardNode = useCallback(
    (laneId: LaneId) => {
      const label = window.prompt(t("prompt.storyboardLabel"));
      if (!label) return;
      const sliceId = window.prompt(t("prompt.storyboardSliceId"));
      if (!sliceId) return;

      const existingInSlice = nodes.find((n) => (n.data as StoryboardNodeData).sliceId === sliceId);
      let x: number;
      if (existingInSlice) {
        x = existingInSlice.position.x;
      } else {
        const distinctSlices = new Set(nodes.map((n) => (n.data as StoryboardNodeData).sliceId));
        x = 40 + distinctSlices.size * COLUMN_WIDTH;
      }
      const lane = LANES.find((l) => l.id === laneId);
      const y = (lane?.yCenter ?? snapYToLane(0).y) - 30;

      const id = newStoryboardNodeId();
      setNodes((nds) => [
        ...nds,
        {
          id,
          type: "storyboard",
          position: { x, y },
          data: { label, laneId, sliceId } as StoryboardNodeData,
        },
      ]);
    },
    [nodes, t],
  );

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [],
  );

  // Add/edit a scenario on whichever node is currently selected — works
  // uniformly on authored or imported nodes, not just ones just created
  // via addStoryboardNode above (keeping node creation itself lean, one
  // prompt for label + one for slice id, nothing more). Mirrors
  // ExampleMapView.tsx's addChild scenario-capture (three chained
  // window.prompt calls), pre-filled with the current values when one
  // already exists. Cancelling the first prompt aborts with no change;
  // submitting all three blank clears the scenario — the one clean,
  // discoverable way to remove one, rather than a separate delete action.
  const editScenario = useCallback(() => {
    if (!selected) return;
    const current = (selected.data as StoryboardNodeData).scenario;
    const given = window.prompt(`${gwt.given}?`, current?.given ?? "");
    if (given === null) return;
    const when = window.prompt(`${gwt.when}?`, current?.when ?? "") ?? "";
    const then = window.prompt(`${gwt.then}?`, current?.then ?? "") ?? "";

    const scenario = given === "" && when === "" && then === "" ? undefined : { given, when, then };
    const selectedId = selected.id;
    setNodes((nds) => nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, scenario } } : n)));
    setSelected((prev) => (prev && prev.id === selectedId ? { ...prev, data: { ...prev.data, scenario } } : prev));
  }, [selected, gwt]);

  // Built from specifications/storyboard-canvas-self/delete-slice.json
  // (exported via export-specifications.mjs from
  // scripts/fixtures/storyboard-canvas-self/delete-slice-example-map.json —
  // spec-1 through spec-7). This is the first feature in this repo built
  // from a real exported spec rather than a prose plan.
  const deleteSlice = useCallback(
    (sliceId: string) => {
      // spec-6/spec-7: warn (don't block) if any Concern references this slice.
      const referencingConcerns = concerns.filter((c) => c.appliesTo?.includes(sliceId));
      const removedIds = new Set(
        nodes.filter((n) => (n.data as StoryboardNodeData).sliceId === sliceId).map((n) => n.id),
      );
      const warning =
        referencingConcerns.length > 0
          ? `${t("prompt.deleteSliceConcernWarning")} ${referencingConcerns.map((c) => c.id).join(", ")}\n\n`
          : "";
      const confirmed = window.confirm(
        `${warning}${t("prompt.deleteSliceConfirm")} (${removedIds.size} ${t("panel.nodes")})`,
      );
      // spec-3: cancelling leaves everything untouched.
      if (!confirmed) return;

      // spec-1/spec-2: drop the slice's own nodes, and any edge touching one
      // of them on EITHER end — this one filter correctly handles both
      // slice-internal edges (both ends removed) and cross-slice edges
      // (only one end removed, edge can no longer resolve either way).
      setNodes((nds) => nds.filter((n) => !removedIds.has(n.id)));
      setEdges((eds) => eds.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)));

      // spec-4: clear a selection that pointed at a now-deleted node.
      setSelected((prev) => (prev && removedIds.has(prev.id) ? null : prev));

      // spec-5: deliberately no localStorage/exampleMapStore call here —
      // the slice's Example Map data is left orphaned/recoverable, not
      // cascade-deleted. Absence of code is the correct behavior.
    },
    [nodes, concerns, t],
  );

  // Concerns aren't verified by anything here — status is whatever the
  // board data declares (see loadBoard.ts's CrossCuttingConcern doc
  // comment). Badge color communicates the declared status, not a live
  // check result.
  const concernBadgeColor = (status: CrossCuttingConcern["status"]) => {
    if (status === "enforced") return theme.color.badge.success;
    if (status === "partially-enforced") return theme.color.badge.info;
    return theme.color.badge.danger;
  };

  if (openSliceId) {
    const slice = slices.find((s) => s.sliceId === openSliceId);
    return (
      <ExampleMapView
        key={openSliceId}
        sliceId={openSliceId}
        sliceLabel={slice?.label ?? openSliceId}
        onBack={() => setOpenSliceId(null)}
      />
    );
  }

  const panelStyle = {
    width: 300,
    borderLeft: `1px solid ${theme.color.border}`,
    padding: theme.space.xl,
    fontFamily: "sans-serif",
    fontSize: theme.fontSize.base,
  } as const;

  return (
    <>
      <div style={{ width: "100vw", height: "100vh", display: "flex" }}>
      <div style={{ flex: 1, position: "relative", overflow: "auto", minWidth: 0 }}>
        <LaneBackground width={CANVAS_WIDTH} />
        <div
          style={{
            position: "absolute",
            top: theme.space.lg,
            left: theme.space.lg,
            zIndex: 10,
            display: "flex",
            gap: theme.space.sm,
            background: theme.color.surface,
            borderRadius: theme.radius.md,
            boxShadow: theme.shadow.md,
            padding: theme.space.sm,
          }}
        >
          {LANES.map((lane) => (
            <Button
              key={lane.id}
              onClick={() => addStoryboardNode(lane.id)}
              style={{ borderBottom: `2px solid ${theme.color.lane[lane.id].border}` }}
            >
              {t("prompt.addNodePrefix")} {lane.label}
            </Button>
          ))}
        </div>
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onNodeClick={(_e, n) => setSelected(n)}
          onNodeDoubleClick={(_e, n) => setOpenSliceId((n.data as StoryboardNodeData).sliceId)}
          translateExtent={[
            [0, 0],
            [CANVAS_WIDTH, TOTAL_HEIGHT],
          ]}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>

      {/* Minimal scenario side panel — proves the "attach GWT to any
          element" feature is structurally wired, not just cosmetic. */}
      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: theme.space.lg }}>
          <h3 style={{ margin: 0 }}>Nomothetes</h3>
          <Button onClick={() => setShowSettings(true)}>{t("panel.settings")}</Button>
        </div>
        <h3 style={{ marginTop: 0 }}>{t("panel.board")}</h3>
        <select
          value={selectedBoardId}
          onChange={(e) => changeBoard(e.target.value)}
          style={{ width: "100%", padding: theme.space.sm, marginBottom: theme.space.lg, fontSize: theme.fontSize.md }}
        >
          {BOARD_SOURCES.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>

        <h3 style={{ marginTop: 0 }}>{t("panel.storyArc")}</h3>
        <div style={{ display: "flex", gap: theme.space.sm, marginBottom: theme.space.xl, alignItems: "center" }}>
          <select
            value={selectedSpec}
            onChange={(e) => changeSpec(e.target.value)}
            style={{ flex: 1, padding: theme.space.sm, fontSize: theme.fontSize.md }}
          >
            {specs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* Small, additive "Load board by ID" input for boards in src/data/*. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadBoardById(loadBoardId.trim());
            }}
            style={{ display: "flex", gap: theme.space.xs, alignItems: "center" }}
          >
            <input
              value={loadBoardId}
              onChange={(e) => setLoadBoardId(e.target.value)}
              placeholder="Load board by ID"
              style={{ padding: theme.space.xs, fontSize: theme.fontSize.sm }}
              onKeyDown={(e) => {
                // Allow Enter to submit from the input itself as well.
                if (e.key === "Enter") {
                  e.preventDefault();
                  void loadBoardById(loadBoardId.trim());
                }
              }}
            />
            <Button onClick={() => void loadBoardById(loadBoardId.trim())}>
              {loadingBoard ? "..." : "Load"}
            </Button>
          </form>
        </div>
        {loadBoardError && (
          <div style={{ color: theme.color.badge.danger, marginBottom: theme.space.xl, fontSize: theme.fontSize.sm }}>
            {loadBoardError}
          </div>
        )}
        <div style={{ color: theme.color.text.muted, marginBottom: theme.space.xl, fontSize: theme.fontSize.sm }}>
          {nodes.length} {t("panel.nodes")}, {edges.length} {t("panel.edges")} — {t("panel.importedFrom")}{" "}
          {BOARD_SOURCES.find((b) => b.id === selectedBoardId)?.label ?? selectedBoardId}
        </div>

        <h3 style={{ marginTop: 0 }}>{t("panel.slices")}</h3>
        <div style={{ maxHeight: 160, overflowY: "auto", marginBottom: theme.space.xl }}>
          {slices.map((s) => (
            <div
              key={s.sliceId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: `${theme.space.xs}px 0`,
                borderBottom: `1px solid ${theme.color.borderLight}`,
                fontSize: theme.fontSize.md,
              }}
            >
              <span title={s.label} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.label}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: theme.space.sm }}>
                {(() => {
                  const summary = exampleMapSummaries[s.sliceId];
                  if (!summary || (!summary.rules && !summary.examples && !summary.questions)) return null;
                  return (
                    <Badge
                      background={summary.openQuestions ? theme.color.badge.danger : theme.color.badge.info}
                      title={`${summary.rules} Rule(s), ${summary.examples} Example(s), ${summary.questions} Question(s)`}
                    >
                      R{summary.rules} E{summary.examples} Q{summary.questions}
                    </Badge>
                  );
                })()}
                <Button onClick={() => setOpenSliceId(s.sliceId)}>{t("panel.exampleMap")}</Button>
                <Button onClick={() => deleteSlice(s.sliceId)}>{t("panel.deleteSlice")}</Button>
              </span>
            </div>
          ))}
        </div>

        {concerns.length > 0 && (
          <>
            <h3 style={{ marginTop: 0 }}>{t("panel.concerns")}</h3>
            <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: theme.space.xl }}>
              {concerns.map((c) => (
                <div key={c.id} style={{ marginBottom: theme.space.sm }}>
                  <div
                    onClick={() => setExpandedConcernId(expandedConcernId === c.id ? null : c.id)}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: `${theme.space.xs}px 0`,
                      borderBottom: `1px solid ${theme.color.borderLight}`,
                      fontSize: theme.fontSize.md,
                      cursor: "pointer",
                    }}
                  >
                    <span title={c.name} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.id} — {c.name}
                    </span>
                    <Badge background={concernBadgeColor(c.status)} title={c.status}>
                      {c.tier} · {c.status}
                    </Badge>
                  </div>
                  {expandedConcernId === c.id && (
                    <div
                      style={{
                        padding: theme.space.sm,
                        background: theme.color.borderLight,
                        fontSize: theme.fontSize.sm,
                        lineHeight: 1.5,
                      }}
                    >
                      <div>{c.statement}</div>
                      {c.why && (
                        <div style={{ color: theme.color.text.muted, marginTop: theme.space.xs }}>
                          <strong>{t("panel.concernWhy")}</strong> {c.why}
                        </div>
                      )}
                      {c.checkScript && (
                        <div style={{ color: theme.color.text.muted, marginTop: theme.space.xs }}>
                          <strong>{t("panel.concernCheck")}</strong> {c.checkScript}
                        </div>
                      )}
                      {c.alertRef && (
                        <div style={{ color: theme.color.text.muted, marginTop: theme.space.xs }}>
                          <strong>{t("panel.concernAlert")}</strong> {c.alertRef}
                        </div>
                      )}
                      {c.appliesTo && c.appliesTo.length > 0 && (
                        <div style={{ color: theme.color.text.muted, marginTop: theme.space.xs }}>
                          <strong>{t("panel.concernAppliesTo")}</strong> {c.appliesTo.join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ marginTop: 0 }}>{t("panel.scenario")}</h3>
          {selected && (
            <Button onClick={editScenario}>
              {(selected.data as StoryboardNodeData).scenario ? t("panel.editScenario") : t("panel.addScenario")}
            </Button>
          )}
        </div>
        {selected ? (
          <>
            <div style={{ fontWeight: 600, marginBottom: theme.space.md }}>{(selected.data as StoryboardNodeData).label}</div>
            {(selected.data as StoryboardNodeData).scenario ? (
              <div style={{ lineHeight: 1.6 }}>
                <div><strong>{gwt.given}</strong> {(selected.data as StoryboardNodeData).scenario!.given}</div>
                <div><strong>{gwt.when}</strong> {(selected.data as StoryboardNodeData).scenario!.when}</div>
                <div><strong>{gwt.then}</strong> {(selected.data as StoryboardNodeData).scenario!.then}</div>
              </div>
            ) : (
              <div style={{ color: theme.color.text.muted }}>{t("panel.noScenario")}</div>
            )}
          </>
        ) : (
          <div style={{ color: theme.color.text.muted }}>{t("panel.clickHint")}</div>
        )}
      </div>
    </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </>
  );
}
