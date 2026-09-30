#!/usr/bin/env node
// Facilitator role definitions for the Interview harness (docs/adr/0004).
// Ported from Ouroboros' "specialized agent perspectives" (Socratic
// Interviewer, Ontologist, Contrarian, Simplifier) and from Martin's own
// PowerGym `agentic-modeling/CLAUDE.md` skill-routing convention this
// codebase's Agentic Modeling write path already implements.
//
// Deliberately DATA, not code that runs an agent — same discipline as
// src/presets/catalog.ts (a declarative array a harness or UI reads, not
// a component that decides anything itself). Nothing here calls an LLM.
// A harness (BYOH — see ADR 0004) reads this catalog to know what each
// pass in the Interview sequence should focus on and which of this
// repo's own write skills (place_element/edit_timeline/edit_example_map/
// run_wdyt/freeze_spec) it's expected to produce prompts for. The actual
// judgment — reading a brief and deciding what to place — stays the
// harness's job, exactly as agentic-worker.mjs's own header comment
// already states for every write skill: "nothing in this codebase turns
// 'add a login screen' into the right call."
//
// Order matters: FACILITATOR_SEQUENCE is the sequence the Interview skill
// (.claude/skills/eventmodeling-interview/) instructs a harness to run in,
// one pass per role, per specId, looping until ambiguity-score.mjs reports
// readyForHandoff or a max-pass budget is hit (never an unbounded loop —
// see the Interview skill for the actual stop condition).

export const FACILITATOR_ROLES = {
  socraticInterviewer: {
    id: "socraticInterviewer",
    name: "Socratic Interviewer",
    focus:
      "Extract explicit goals, actors, and constraints already stated in the brief — asks clarifying questions rather than inventing detail the brief doesn't have. First pass: reads only, decides what the brief actually says before anything gets placed.",
    primarySkills: [],
    onGap: "add_question",
  },
  ontologist: {
    id: "ontologist",
    name: "Ontologist",
    focus:
      "Proposes the Actor/Screen/Action/Outcome elements and slice boundaries implied by what the Socratic Interviewer pass extracted — the structural pass that actually populates the timeline.",
    primarySkills: ["place_element", "edit_timeline"],
    onGap: "add_question",
  },
  contrarian: {
    id: "contrarian",
    name: "Contrarian",
    focus:
      "Stress-tests the board the Ontologist pass produced for missing failure paths — the same 'every Outcome is a candidate failure mode' rule from Board Vocabulary → Operability Mapping, applied during generation instead of after the fact. Never silently invents a failure outcome; adds one only when the brief or an existing Rule implies it, otherwise leaves a Question.",
    primarySkills: ["place_element", "edit_example_map"],
    onGap: "add_question",
  },
  simplifier: {
    id: "simplifier",
    name: "Simplifier",
    focus:
      "Reviews for redundant/overlapping slices before the board is scored. Known gap, stated honestly (see ADR 0004): no merge/collapse mutation exists yet in board-mutations.mjs, so this pass can only flag duplication via run_wdyt-style findings for a human to resolve, not act on it directly — the same 'don't invent what the tool can't do yet' discipline as everywhere else in this codebase.",
    primarySkills: ["run_wdyt"],
    onGap: "add_question",
  },
};

/** The sequence the Interview skill runs, one full pass per role per loop
 * iteration. Kept as an explicit array (not just Object.keys order) so the
 * sequence is a stated design decision, not an accident of insertion
 * order. */
export const FACILITATOR_SEQUENCE = ["socraticInterviewer", "ontologist", "contrarian", "simplifier"];
