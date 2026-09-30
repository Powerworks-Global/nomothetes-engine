# ADR 0003: Fixed Y-band swimlanes, not a freeform canvas

**Status:** Accepted, 2026-09-02

## Context

eventmodelers.ai's own board is a freeform timeline where elements can be placed anywhere. This canvas's Layer 1 design (per the brief) calls for a specific fixed structure: Actor/Screen/Action/Outcome/Owned-Data as distinct horizontal lanes, time flowing left-to-right within each lane.

## Decision

Implement fixed, non-negotiable Y-bands (`src/lanes.ts`) rather than a freeform canvas where lane membership is just a loose convention.

## Reasoning

The whole point of the CRUD-native reframe (see the project's background in [docs/plan.md](../plan.md)) is to keep Event Modeling's discovery power (exposing ordering gaps, screens reading data nothing produces) while dropping its formalism burden. A fixed lane structure makes "what type of thing is this" and "does this screen have something feeding it" visually obvious without requiring the reader to infer it from freeform placement — same instinct as a real physical swimlane diagram on a wall.

## Consequences

- Swimlanes aren't a React Flow primitive (see [ADR 0001](0001-react-flow-over-tldraw.md)) — implemented as background bands plus a drag-snap handler on node drop.
- A node's lane is derived data (`laneId` on each node), not free-text — this is what let the import adapter's lane-based edge resolution (see [ADR 0002](0002-mcp-export-over-per-harness-adapters.md)'s sibling context, and the self-loop bug fix in the import adapter) work correctly: a Screen and a Command sharing a label are still distinguishable by lane.
- Timeline-column layout (X position) is computed from slice order, not free placement — see [docs/solution-architecture.md](../solution-architecture.md)'s description of `loadBoard.ts`.
