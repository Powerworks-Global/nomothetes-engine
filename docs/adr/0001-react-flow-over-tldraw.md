# ADR 0001: React Flow over tldraw for the canvas SDK

**Status:** Accepted, 2026-09-02

## Context

The canvas needs a custom node-based board UI: typed nodes (Actor/Screen/Action/Outcome/Owned-Data), custom edges, drag-and-drop with lane-snapping. Two realistic candidates for the underlying canvas library: `tldraw` and React Flow (`@xyflow/react`).

## Decision

React Flow.

## Reasoning

- **Licensing**: tldraw is now under a source-available license requiring a paid commercial license for commercial use. The end goal at the time this was decided was an internal tool at a prior employer (see [docs/plan.md](../plan.md) — superseded 2026-10-04, project is now Powerworks-Global's own Nomothetes); building the personal MVP on tldraw risked a licensing wall right when it would have mattered most. React Flow's core is MIT-licensed, no commercial-use restriction — the reasoning holds regardless of which commercial context it's evaluated against.
- **Structural fit**: React Flow's custom node types and custom edges are first-class in the core library, not a paid tier — a strong match for this board's typed-node/typed-edge shape. tldraw's strength (freeform, hand-drawn-style whiteboarding) isn't the shape of what this board actually needs.
- **Stack fit**: React Flow is React, matching existing frontend fluency, and gives no new framework to learn just for this spike.

## Consequences

Swimlanes aren't a React Flow primitive — implemented as plain absolutely-positioned background divs (`src/LaneBackground.tsx`) plus a drag-snap handler, not a built-in feature. This is a well-documented community pattern, not exotic, but it is custom code this project owns rather than a library feature.
