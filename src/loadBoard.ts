import type { Node, Edge } from "@xyflow/react";
import { LANES, snapYToLane, type LaneId } from "./lanes";
import type { StoryboardNodeData } from "./StoryboardNode";
import type { ExampleMapBoard } from "./exampleMapStore";
import defaultBoard from "./data/powergym-board.json";

/** Shape produced by scripts/import-eventmodelers.mjs — see that file for
 * the source markdown format this was parsed from. Also the shape any
 * other board source (src/boards/registry.ts) must produce. */
export interface ImportedNode {
  id: string;
  label: string;
  laneId: LaneId;
  sliceId: string;
  sliceType: string;
  specId: string;
}
export interface ImportedEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}
/** An AOP-style cross-cutting concern (security/observability/performance/
 * compliance NFR) — deliberately NOT a node in the lane grid. Lanes are
 * per-slice, time-ordered columns; a concern like "no duplicate rejection"
 * or "EEA-only hosting" doesn't belong to one slice, so forcing it into
 * the timeline would misrepresent it as slice-scoped. Mirrors a sibling project's
 * proven eval/CONSTITUTION.md convention (Tier A/B/C, Why, Status) as
 * board data instead of a disconnected markdown file.
 *
 * KNOWN, STATED LIMITATION: `status` is hand-maintained here, same as the
 * markdown precedent — it is NOT derived from whether `checkScript`
 * actually passes. Treat it as a declaration, not a verified fact, until
 * a real check-running mechanism exists (the precedent's own C1 check is
 * bespoke inline logic, not a reusable per-concern runner either). */
export interface CrossCuttingConcern {
  id: string;
  name: string;
  tier: "A" | "B" | "C";
  statement: string;
  why?: string;
  status: "declared" | "enforced" | "partially-enforced";
  /** Name/path of the script that enforces this, if any. Informational
   * only — nothing here actually runs it. */
  checkScript?: string;
  /** A second, independent enforcement channel (e.g. a Grafana rule name)
   * that can be "provisioned but not yet able to fire" separately from
   * checkScript's own status — the precedent's C1 does exactly this. */
  alertRef?: string;
  /** sliceIds this concern is scoped to (the "pointcut"). Omitted or
   * empty = applies board-wide. */
  appliesTo?: string[];
}

export interface ImportedBoard {
  nodes: ImportedNode[];
  edges: ImportedEdge[];
  /** WS2.5 — a seed Layer 2 Example Map per slice where the source's
   * Functional Requirements/Acceptance Criteria had real content to pull
   * in, keyed by sliceId. Not present for every slice: only ones an FR row
   * could be joined to an AC and resolved to an element (see the import
   * script's own logged skips for the rare cases it couldn't). */
  seedExampleMaps?: Record<string, ExampleMapBoard>;
  /** Board-wide (or multi-slice) NFRs/cross-cutting concerns. Optional —
   * absent on any board that hasn't been given a worked example yet
   * (e.g. PowerGym's import has none). */
  crossCuttingConcerns?: CrossCuttingConcern[];
}

/** The currently active board — defaults to PowerGym's, matching the
 * app's pre-board-registry behavior. Switched via setActiveBoard, called
 * by App.tsx's board-source picker (src/boards/registry.ts). All the
 * query functions below read this module-level reference rather than
 * taking a board param on every call, so existing call sites elsewhere
 * (e.g. ExampleMapView.tsx's getSeedExampleMap(sliceId)) don't need to
 * change just because a second board now exists. */
let board = defaultBoard as ImportedBoard;

export function setActiveBoard(next: ImportedBoard): void {
  board = next;
}

/** Exported so authored nodes (App.tsx's Layer 1 toolbar) can lay out
 * identically to imported ones — same column-per-slice spacing. */
export const COLUMN_WIDTH = 300;

/** All spec ids present in the imported board, in file order (stable —
 * matches the order scripts/import-eventmodelers.mjs was invoked with). */
export function listSpecs(): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const n of board.nodes) {
    if (!seen.has(n.specId)) {
      seen.add(n.specId);
      order.push(n.specId);
    }
  }
  return order;
}

export interface SliceSummary {
  sliceId: string;
  label: string;
}

/** Slices for one spec, in order of first appearance, labeled by their
 * Screen node when present (most readable) or their first node otherwise —
 * the source board carries no separate slice title field. */
export function listSlices(specId: string): SliceSummary[] {
  const specNodes = board.nodes.filter((n) => n.specId === specId);
  const seen = new Set<string>();
  const order: SliceSummary[] = [];
  for (const n of specNodes) {
    if (seen.has(n.sliceId)) continue;
    seen.add(n.sliceId);
    const screenNode = specNodes.find((m) => m.sliceId === n.sliceId && m.laneId === "screen");
    order.push({ sliceId: n.sliceId, label: (screenNode ?? n).label });
  }
  return order;
}

/** Load one spec (story-arc) as React Flow nodes/edges, laid out on the
 * fixed lane bands from lanes.ts. The source board carries no position
 * data at all (confirmed against the real PowerGym export — every
 * element is field-less), so layout is computed here: slices become
 * timeline columns in their order of first appearance in the source
 * file, nodes within a slice snap to their lane's Y center. */
export function loadSpec(specId: string): { nodes: Node[]; edges: Edge[] } {
  const specNodes = board.nodes.filter((n) => n.specId === specId);
  const specEdges = board.edges.filter((e) =>
    specNodes.some((n) => n.id === e.source) && specNodes.some((n) => n.id === e.target),
  );

  const sliceOrder: string[] = [];
  const seenSlices = new Set<string>();
  for (const n of specNodes) {
    if (!seenSlices.has(n.sliceId)) {
      seenSlices.add(n.sliceId);
      sliceOrder.push(n.sliceId);
    }
  }
  const columnOf = new Map(sliceOrder.map((sliceId, i) => [sliceId, i]));

  const nodes: Node[] = specNodes.map((n) => {
    const x = 40 + (columnOf.get(n.sliceId) ?? 0) * COLUMN_WIDTH;
    const lane = LANES.find((l) => l.id === n.laneId);
    const y = (lane?.yCenter ?? snapYToLane(0).y) - 30;
    return {
      id: n.id,
      type: "storyboard",
      position: { x, y },
      data: { label: n.label, laneId: n.laneId, sliceId: n.sliceId } as StoryboardNodeData,
    };
  });

  const edges: Edge[] = specEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    animated: e.label === "produces",
    style: e.label === "triggers" ? { strokeDasharray: "5 5" } : undefined,
  }));

  return { nodes, edges };
}

/** The board-derived seed Example Map for one slice, if the import script
 * (WS2.5) found real Functional Requirements/Acceptance Criteria content
 * to build one from. Undefined for a slice with none — the caller decides
 * what "no seed" means (an empty board, most likely). */
export function getSeedExampleMap(sliceId: string): ExampleMapBoard | undefined {
  return board.seedExampleMaps?.[sliceId];
}

/** The active board's cross-cutting concerns, if any — empty array for a
 * board with none (e.g. PowerGym today), never undefined, so callers can
 * render an empty Concerns section rather than branching on presence. */
export function listCrossCuttingConcerns(): CrossCuttingConcern[] {
  return board.crossCuttingConcerns ?? [];
}
