# ADR 0001: React Flow over tldraw for the canvas SDK

**Status:** Accepted, 2026-09-02

## Context

The canvas needs a custom node-based board UI: typed nodes (Actor/Screen/Action/Outcome/Owned-Data), custom edges, drag-and-drop with lane-snapping. Two realistic candidates for the underlying canvas library: `tldraw` and React Flow (`@xyflow/react`).

## Decision

React Flow.

## Reasoning

- **Licensing**: tldraw is now under a source-available license requiring a paid commercial license for commercial use. Since the actual end goal is a Version1-internal tool (see [docs/plan.md](../plan.md)), building the personal MVP on tldraw risks a licensing wall right when it would matter most. React Flow's core is MIT-licensed, no commercial-use restriction.
- **Structural fit**: React Flow's custom node types and custom edges are first-class in the core library, not a paid tier — a strong match for this board's typed-node/typed-edge shape. tldraw's strength (freeform, hand-drawn-style whiteboarding) isn't the shape of what this board actually needs.
- **Stack fit**: React Flow is React, matching existing frontend fluency, and gives no new framework to learn just for this spike.

## Consequences

Swimlanes aren't a React Flow primitive — implemented as plain absolutely-positioned background divs (`src/LaneBackground.tsx`) plus a drag-snap handler, not a built-in feature. This is a well-documented community pattern, not exotic, but it is custom code this project owns rather than a library feature.
