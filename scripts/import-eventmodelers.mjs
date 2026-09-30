#!/usr/bin/env node
// Import adapter: parses eventmodelers.ai board exports (as transcribed
// verbatim into requirements.md/research.md by the PowerGym-style build
// kit) into this canvas's Layer 1 node/edge schema, plus (WS2.5) a seed
// Layer 2 Example Map per slice where the source has real rule/example
// content to pull in.
//
// Source shape (from real PowerGym specs, not assumed):
//   requirements.md "## Event Model Detail (Source of Truth)" section:
//     ### Slice: <Name> (`<uuid>`, status: <status>, type: STATE_CHANGE|AUTOMATION)
//     **<ElementName>** (<command|event|automation/processor>, id `<uuid>`, ...)
//     Dependencies: ← <Other> (<TYPE>)   [or →]
//   research.md "## UI Reference" section:
//     _(from slice: <SliceName>)_
//     **<ScreenName>** (screen, id `<uuid>`, ...)
//     Dependencies: → <Command> (COMMAND)
//   requirements.md "## Functional Requirements" table (seeds a Rule card
//   per row — confirmed a real, board-derived requirement sentence, not
//   boilerplate) joined 1:1 to its "## User Stories" Acceptance Criteria
//   bullet (seeds that Rule's child Example card):
//     | FR-N | System MUST/SHOULD support <Element>, producing <Event>(s) | Must|Should | AC-N.M |
//     - AC-N.M: [_<title>_ —] Given <given>, When <when>, Then <then>
//   requirements.md "## Unresolved Questions" — real content would seed
//   Question cards, but every one of the 18 real specs checked is exactly
//   "- None": parsed for real, never fabricated, currently always empty.
//
// Usage: node scripts/import-eventmodelers.mjs <specDir> [<specDir> ...] > board.json

import { readFileSync, existsSync } from "node:fs";
import { basename, join } from "node:path";

/** @typedef {{ id: string, label: string, laneId: string, sliceId: string, sliceType: string, specId: string }} ImportedNode */
/** @typedef {{ source: string, target: string, label: string }} ImportedEdge */

const SLICE_RE = /^### Slice: (.+?) \(`([^`]+)`, status: (\S+), type: (\S+)\)$/;
const ELEMENT_RE = /^\*\*(.+?)\*\* \((command|event|automation\/processor|screen)(?:, id `([^`]+)`)?/;
const DEP_RE = /^Dependencies: (←|→) (.+?) \((\w+)\)/;
const SCREEN_CONTEXT_RE = /^_\(from slice: (.+?)\)_$/;
const AC_RE = /^- (AC-\S+): (?:_(.+?)_ — )?Given (.+?), When (.+?), Then (.+)$/;
const FR_ROW_RE = /^\|\s*(FR-\d+)\s*\|\s*(.+?)\s*\|\s*(\S+)\s*\|\s*(AC-\S+)\s*\|$/;
const UNRESOLVED_Q_RE = /^- (.+)$/;
const EVENT_FROM_FR_RE = /producing (?:the )?(.+?) domain event\(s\)$/;

function elementTypeToLane(elementType, sliceType) {
  if (elementType === "screen") return "screen";
  if (elementType === "event") return "outcome";
  if (elementType === "automation/processor") return "action";
  if (elementType === "command") {
    // In an AUTOMATION-type slice, the command is the automation's own
    // trigger — redundant with the automation/processor node itself, so
    // it's skipped rather than duplicated (matches the hand-built
    // Member Registration reference import).
    return sliceType === "AUTOMATION" ? null : "action";
  }
  return null;
}

/** Parse one spec's requirements.md Event Model Detail section. */
function parseRequirements(text, specId) {
  /** @type {ImportedNode[]} */
  const nodes = [];
  /** @type {ImportedEdge[]} */
  const edges = [];
  /** @type {Map<string, string>} */
  const sliceIdsByName = new Map();
  /** Every command/automation/event element's label -> sliceId, regardless
   * of whether it was kept as a Layer 1 node or skipped as a redundant
   * AUTOMATION-slice command — an AC's "When <label>" can name either, so
   * the seed-Example join (buildSeedExampleMaps) needs the full set, not
   * just the kept nodes. Last-write-wins per label, which is only safe
   * as a fallback: a label can be reused across sibling slices in the
   * same spec (confirmed in real data — two AUTOMATION slices both name
   * their automation "Shift Guard"), so the primary join key is the
   * produced-event label below, which doesn't collide in any real spec. */
  const elementSliceByLabel = new Map();
  /** Every event element's label -> every sliceId that produces an event
   * with that label (array, to detect collisions rather than silently
   * picking one) — an FR row's "producing the <Event> domain event(s)"
   * names this label, and it's confirmed unique per spec across all 18
   * real PowerGym specs, unlike command/automation labels. */
  const eventSliceByLabel = new Map();
  const lines = text.split("\n");

  let currentSlice = null;
  let currentElementId = null;
  let inDetailSection = false;

  for (const line of lines) {
    if (line.startsWith("## Event Model Detail")) {
      inDetailSection = true;
      continue;
    }
    if (!inDetailSection) continue;

    const sliceMatch = line.match(SLICE_RE);
    if (sliceMatch) {
      currentSlice = { name: sliceMatch[1], id: sliceMatch[2], status: sliceMatch[3], type: sliceMatch[4] };
      sliceIdsByName.set(currentSlice.name, currentSlice.id);
      continue;
    }

    const elMatch = line.match(ELEMENT_RE);
    if (elMatch && currentSlice) {
      const [, name, elementType, elId] = elMatch;
      const laneId = elementTypeToLane(elementType, currentSlice.type);
      currentElementId = elId ? `${specId}:${elId}` : null;
      elementSliceByLabel.set(name, currentSlice.id);
      if (elementType === "event") {
        if (!eventSliceByLabel.has(name)) eventSliceByLabel.set(name, []);
        eventSliceByLabel.get(name).push(currentSlice.id);
      }
      if (laneId && currentElementId) {
        nodes.push({
          id: currentElementId,
          label: name,
          laneId,
          sliceId: currentSlice.id,
          sliceType: currentSlice.type,
          specId,
        });
      } else {
        currentElementId = null; // skipped element (e.g. redundant command) — no edges to it
      }
      continue;
    }

    const depMatch = line.match(DEP_RE);
    if (depMatch && currentElementId) {
      const [, arrow, otherName, otherType] = depMatch;
      // Label by the referenced element's actual type, matching
      // research.md's own convention for the same relationship (a Screen
      // triggers a Command; only a Command produces an Event) — not a
      // blanket "produces" regardless of what's on the other end.
      const label = otherType === "SCREEN" ? "triggers" : "produces";
      // Dependency target is named, not id-linked in the source text —
      // resolved to a node id in a second pass once all specs are parsed
      // (see resolveEdges below), since the referenced element may be a
      // Screen defined only in research.md, parsed separately. The type
      // is embedded in the placeholder (NAME:<TYPE>:<name>) because a
      // Screen and a Command/Automation can share the exact same label
      // (confirmed in real PowerGym data) — resolving by label alone
      // would let one silently overwrite the other in the lookup map.
      edges.push(
        arrow === "←"
          ? { source: `NAME:${otherType}:${otherName}`, target: currentElementId, label }
          : { source: currentElementId, target: `NAME:${otherType}:${otherName}`, label },
      );
    }
  }

  return { nodes, edges, sliceIdsByName, elementSliceByLabel, eventSliceByLabel };
}

/** Parse every "**Acceptance Criteria:**" bullet across all User Stories:
 *  `- AC-N.M: _<title>_ — Given <given>, When <when>, Then <then>` (title
 *  is optional — some ACs omit it and start straight at "Given"). Returns
 *  one entry per AC line, keyed by its id for the FR join below. */
function parseAcceptanceCriteria(text) {
  const byId = new Map();
  for (const line of text.split("\n")) {
    const m = line.match(AC_RE);
    if (m) {
      const [, acId, title, given, when, then] = m;
      byId.set(acId, { acId, title: title ?? null, given, when, then });
    }
  }
  return byId;
}

/** Parse the "## Functional Requirements" table: each row is a real,
 * board-derived Rule-shaped sentence ("System MUST/SHOULD support X,
 * producing Y") referencing exactly one Acceptance Criterion — confirmed
 * 1:1 across all 18 real PowerGym specs, never a comma-separated list. */
function parseFunctionalRequirements(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    const m = line.match(FR_ROW_RE);
    if (m) {
      const [, frId, requirementText, priority, acRef] = m;
      rows.push({ frId, text: requirementText, priority, acRef });
    }
  }
  return rows;
}

/** Parse "## Unresolved Questions" — real content if the board export ever
 * carries any (checked against all 18 current PowerGym specs: every one is
 * exactly "- None", so this always returns [] today; kept as real parsing,
 * not dead code, for whenever a spec actually has one). */
function parseUnresolvedQuestions(text) {
  const section = text.split(/^## Unresolved Questions$/m)[1];
  if (!section) return [];
  const body = section.split(/^## /m)[0];
  const questions = [];
  for (const line of body.split("\n")) {
    const m = line.match(UNRESOLVED_Q_RE);
    if (m && m[1].trim() !== "None") questions.push(m[1].trim());
  }
  return questions;
}

/** Join Functional Requirements to their Acceptance Criteria and resolve
 * each to a sliceId primarily via the FR's own "producing the <Event>
 * domain event(s)" text, looked up against every parsed event element's
 * label — confirmed unique per spec across all 18 real PowerGym specs,
 * unlike command/automation labels (two AUTOMATION slices can and do
 * share an automation label, e.g. "Shift Guard" in 006-staffing, which
 * would otherwise misattribute both slices' seeds to whichever slice was
 * parsed last). Falls back to the AC's "When <label>" text, looked up
 * against every parsed element's label (not just kept Layer 1 nodes) —
 * an AUTOMATION-type slice's AC names its command, which
 * `elementTypeToLane` deliberately skips as redundant with the
 * automation/processor node, so the kept-nodes set alone would miss most
 * AUTOMATION slices (confirmed: skips every one of them before this fix).
 * Produces one seed Example
 * Map board per slice: one Rule node (the FR sentence) with one child
 * Example (the AC's Given/When/Then) — mirrors exactly what a human would
 * build by hand in the Example Map UI, so it needs no new schema. Node ids
 * are deterministic (not Date.now()-based, unlike hand-authored cards) so
 * re-running this generator produces stable, diffable output. No Question
 * nodes are seeded: the source's "Unresolved Questions" section has no
 * per-slice attribution in any real spec (every one is empty anyway — see
 * parseUnresolvedQuestions), so inventing a slice mapping isn't possible
 * without guessing. */
function buildSeedExampleMaps(elementSliceByLabel, eventSliceByLabel, frRows, acById, specId) {
  /** @type {Map<string, { nodes: object[], edges: object[] }>} */
  const bySlice = new Map();

  for (const fr of frRows) {
    const ac = acById.get(fr.acRef);
    if (!ac) {
      console.error(`[seed] ${fr.frId} references ${fr.acRef}, no matching Acceptance Criteria line found — skipped`);
      continue;
    }
    const eventMatch = fr.text.match(EVENT_FROM_FR_RE);
    const eventName = eventMatch ? eventMatch[1].trim() : null;
    const eventSliceIds = eventName ? eventSliceByLabel.get(eventName) : undefined;
    let sliceId;
    if (eventSliceIds?.length === 1) {
      sliceId = eventSliceIds[0];
    } else {
      if (eventSliceIds?.length > 1) {
        console.error(`[seed] [${specId}] ${fr.frId}'s produced event "${eventName}" is modeled in ${eventSliceIds.length} slices — ambiguous, falling back to "When ${ac.when}" element lookup`);
      }
      sliceId = elementSliceByLabel.get(ac.when);
    }
    if (!sliceId) {
      console.error(`[seed] ${fr.acRef}'s "When ${ac.when}" doesn't match any element in the Event Model Detail appendix — skipped`);
      continue;
    }
    if (!bySlice.has(sliceId)) bySlice.set(sliceId, { nodes: [], edges: [] });
    const board = bySlice.get(sliceId);
    const ruleId = `seed-rule-${sliceId}-${fr.frId}`;
    const exampleId = `seed-example-${sliceId}-${ac.acId}`;
    board.nodes.push({
      id: ruleId,
      type: "exampleMap",
      position: { x: 40 + board.nodes.length * 40, y: 40 + board.nodes.length * 20 },
      data: { nodeType: "rule", label: fr.text },
    });
    board.nodes.push({
      id: exampleId,
      type: "exampleMap",
      position: { x: 40 + board.nodes.length * 40 + 240, y: 40 + board.nodes.length * 20 + 160 },
      data: {
        nodeType: "example",
        label: ac.title ?? ac.acId,
        scenario: { given: ac.given, when: ac.when, then: ac.then },
      },
    });
    board.edges.push({ id: `${ruleId}-${exampleId}`, source: ruleId, target: exampleId });
  }

  return Object.fromEntries(bySlice);
}

/** Parse research.md's UI Reference section for Screen elements + their Dependencies. */
function parseScreens(text, specId, sliceIdsByName) {
  /** @type {ImportedNode[]} */
  const nodes = [];
  /** @type {ImportedEdge[]} */
  const edges = [];
  const lines = text.split("\n");

  let inUiRef = false;
  let currentSliceName = null;
  let currentScreenId = null;

  for (const line of lines) {
    if (line.startsWith("## UI Reference")) {
      inUiRef = true;
      continue;
    }
    if (!inUiRef) continue;

    const ctxMatch = line.match(SCREEN_CONTEXT_RE);
    if (ctxMatch) {
      currentSliceName = ctxMatch[1];
      continue;
    }

    const elMatch = line.match(ELEMENT_RE);
    if (elMatch && elMatch[2] === "screen") {
      const [, name, , elId] = elMatch;
      currentScreenId = elId ? `${specId}:${elId}` : null;
      if (currentScreenId) {
        let sliceId = "";
        if (currentSliceName) {
          sliceId = sliceIdsByName.get(currentSliceName);
          if (sliceId === undefined) {
            console.error(`[${specId}] screen "${name}" references unknown slice "${currentSliceName}" — falling back to raw name, timeline column may be wrong`);
            sliceId = currentSliceName;
          }
        }
        nodes.push({ id: currentScreenId, label: name, laneId: "screen", sliceId, sliceType: "SCREEN", specId });
      }
      continue;
    }

    const depMatch = line.match(DEP_RE);
    if (depMatch && currentScreenId) {
      const [, arrow, otherName, otherType] = depMatch;
      edges.push(
        arrow === "→"
          ? { source: currentScreenId, target: `NAME:${otherType}:${otherName}`, label: "triggers" }
          : { source: `NAME:${otherType}:${otherName}`, target: currentScreenId, label: "triggers" },
      );
    }
  }

  return { nodes, edges };
}

const TYPE_TO_LANE = { SCREEN: "screen", COMMAND: "action", AUTOMATION: "action", PROCESSOR: "action", EVENT: "outcome" };

/** Second pass: resolve NAME:<TYPE>:<label> edge endpoints to real node
 * ids. Keyed by (label, laneId) rather than label alone — a Screen and a
 * Command/Automation can share the exact same label in real PowerGym
 * data (e.g. both named "Cancel Membership"), and resolving by label
 * alone lets whichever node was added last silently win the lookup slot,
 * producing a self-loop where a dependency resolves back to itself
 * instead of the actually-referenced element. Cross-spec dependencies
 * are left unresolved and dropped with a warning — out of scope here. */
function resolveEdges(nodes, edges, specId) {
  const byLabelAndLane = new Map(
    nodes.filter((n) => n.specId === specId).map((n) => [`${n.label}::${n.laneId}`, n.id]),
  );
  const resolveName = (ref) => {
    if (!ref.startsWith("NAME:")) return ref;
    const [, type, ...nameParts] = ref.split(":");
    const name = nameParts.join(":");
    const lane = TYPE_TO_LANE[type];
    return lane ? byLabelAndLane.get(`${name}::${lane}`) : undefined;
  };
  const resolved = [];
  let dropped = 0;
  for (const e of edges) {
    const source = resolveName(e.source);
    const target = resolveName(e.target);
    if (source && target) {
      resolved.push({ id: `e-${source}-${target}`, source, target, label: e.label });
    } else {
      dropped++;
    }
  }
  if (dropped > 0) {
    console.error(`[${specId}] dropped ${dropped} edge(s) with unresolved endpoints (likely cross-spec dependencies, or a skipped redundant command)`);
  }
  return resolved;
}

/** The source text never states "this Action produces this Outcome"
 * explicitly — they're implicitly paired by both belonging to the same
 * Slice block. Inferred here, not invented: within one slice, an
 * Action-lane node followed by an Outcome-lane node is exactly the
 * Command→Event pairing every STATE_CHANGE/AUTOMATION slice models. */
function inferProducesEdges(nodes) {
  const bySlice = new Map();
  for (const n of nodes) {
    if (n.laneId !== "action" && n.laneId !== "outcome") continue;
    if (!bySlice.has(n.sliceId)) bySlice.set(n.sliceId, []);
    bySlice.get(n.sliceId).push(n);
  }
  const edges = [];
  for (const [, members] of bySlice) {
    const action = members.find((n) => n.laneId === "action");
    const outcome = members.find((n) => n.laneId === "outcome");
    if (action && outcome) {
      edges.push({ id: `e-${action.id}-${outcome.id}`, source: action.id, target: outcome.id, label: "produces" });
    }
  }
  return edges;
}

function importSpec(specDir) {
  const specId = basename(specDir);
  const reqPath = join(specDir, "requirements.md");
  const resPath = join(specDir, "research.md");
  if (!existsSync(reqPath)) {
    console.error(`[${specId}] missing requirements.md — skipped`);
    return { nodes: [], edges: [], seedExampleMaps: {} };
  }
  const reqText = readFileSync(reqPath, "utf-8");
  const resText = existsSync(resPath) ? readFileSync(resPath, "utf-8") : "";

  const req = parseRequirements(reqText, specId);
  const scr = parseScreens(resText, specId, req.sliceIdsByName);

  const allNodes = [...req.nodes, ...scr.nodes];
  const explicitEdges = resolveEdges(allNodes, [...req.edges, ...scr.edges], specId);
  const producesEdges = inferProducesEdges(allNodes);

  const acById = parseAcceptanceCriteria(reqText);
  const frRows = parseFunctionalRequirements(reqText);
  const seedExampleMaps = buildSeedExampleMaps(req.elementSliceByLabel, req.eventSliceByLabel, frRows, acById, specId);
  const unresolvedQuestions = parseUnresolvedQuestions(reqText);
  if (unresolvedQuestions.length > 0) {
    console.error(`[${specId}] ${unresolvedQuestions.length} real Unresolved Question(s) found (unprecedented in current data) — not seeded as Question cards, no per-slice attribution exists in this source format: ${unresolvedQuestions.join(" | ")}`);
  }

  return { nodes: allNodes, edges: [...explicitEdges, ...producesEdges], seedExampleMaps };
}

const specDirs = process.argv.slice(2);
if (specDirs.length === 0) {
  console.error("Usage: node import-eventmodelers.mjs <specDir> [<specDir> ...]");
  process.exit(1);
}

let allNodes = [];
let allEdges = [];
let allSeedExampleMaps = {};
for (const dir of specDirs) {
  const { nodes, edges, seedExampleMaps } = importSpec(dir);
  allNodes = allNodes.concat(nodes);
  allEdges = allEdges.concat(edges);
  allSeedExampleMaps = { ...allSeedExampleMaps, ...seedExampleMaps };
  console.error(`[${basename(dir)}] ${nodes.length} nodes, ${edges.length} edges, ${Object.keys(seedExampleMaps).length} slice(s) with a seeded Example Map`);
}

// Dedupe: requirements.md and research.md each independently encode a
// Screen<->Action relationship from their own side (requirements.md's
// command lists "Dependencies: ← <Screen>"; research.md's screen entry
// lists "Dependencies: → <Command>") — same edge, two source files.
// Keep the first occurrence per (source,target) pair.
const seen = new Set();
const dedupedEdges = allEdges.filter((e) => {
  const key = `${e.source}->${e.target}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
if (dedupedEdges.length < allEdges.length) {
  console.error(`Deduped ${allEdges.length - dedupedEdges.length} duplicate edge(s) (same source/target from both requirements.md and research.md)`);
}

console.log(JSON.stringify({ nodes: allNodes, edges: dedupedEdges, seedExampleMaps: allSeedExampleMaps }, null, 2));
