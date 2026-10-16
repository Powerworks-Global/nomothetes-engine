#!/usr/bin/env node
// Closes the gap annotate-specifications.mjs's header names as deliberately
// out of scope: where the annotations file comes from. That script's header
// says producing the annotations map is "out of scope here and deliberately
// not automated yet" — this script closes exactly that gap: it reads a real
// vitest run's machine-readable JSON report (`vitest run --reporter=json
// --outputFile.json=<file>`) and produces the annotations map
// mechanically, keyed the same way, for annotate-specifications.mjs to merge.
//
// The spec-to-test link is declared by the test itself, the way JUnit's
// @TestCase or pytest markers do it — a passing test declares what it
// verifies:
//
//   it("removes the slice's nodes and edges", {
//     meta: {
//       spec: "storyboard-canvas-self.delete-slice#spec-1",   // "<sliceId>#<specId>"
//       implementation: "src/App.tsx#deleteSlice",            // "<file>#<symbol>"
//     },
//   }, async () => { ... });
//
// What is NOT hand-authored anymore, and what still is: `verificationStatus`
// (state, testRef, lastRunAt) is derived from the run's own machine-readable
// vitest JSON report — a spec is "passed" only if a test carrying its tag
// actually ran and actually passed in this report; no tag, no annotation,
// whatever the developer believes. `implementationRef` is still declared by
// the test author (a test run cannot know *which* module is meant to satisfy
// a spec), but it is checked mechanically two ways: the named file must
// exist in this checkout, and it rides along with a test that demonstrably
// ran. Naming a wrong-but-existing file is a code-review concern, same as
// naming a wrong function in any code comment; proving the test *exercised*
// that module (coverage attribution per test) is not possible from a vitest
// JSON report and stays future work, adjacent to Phase 7's downstream build
// gate.
//
// Usage (CI):
//   node scripts/derive-annotations.mjs \
//     --report <vitest-json-report.json> \
//     --specifications <specifications.json from export-specifications.mjs> \
//     --annotations-out <annotations.json for annotate-specifications.mjs> \
//     [--document-out <specifications.json + top-level derivedFrom provenance>] \
//     [--commit <sha>] [--run-id <id>] [--gate]
//
// --gate makes the run exit 1, one line per offending specification, when a
// specification has no annotation at all, an annotation whose state is not
// "passed", or no implementationRef. A green job then means every committed
// specification was verified by a passing test in this exact run.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

function parseArgs(argv) {
  const args = {
    report: null,
    specifications: null,
    annotationsOut: null,
    documentOut: null,
    commit: null,
    runId: null,
    gate: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--report") args.report = argv[++i];
    else if (argv[i] === "--specifications") args.specifications = argv[++i];
    else if (argv[i] === "--annotations-out") args.annotationsOut = argv[++i];
    else if (argv[i] === "--document-out") args.documentOut = argv[++i];
    else if (argv[i] === "--commit") args.commit = argv[++i];
    else if (argv[i] === "--run-id") args.runId = argv[++i];
    else if (argv[i] === "--gate") args.gate = true;
  }
  return args;
}

function refuse(message) {
  const err = new Error(message);
  err.isRefusal = true;
  return err;
}

/** Flatten a vitest JSON report into one record per test, sorted for determinism. */
function collectTaggedTests(report, cwd) {
  const tests = [];
  for (const fileResult of report.testResults ?? []) {
    for (const a of fileResult.assertionResults ?? []) {
      const spec = a.meta?.spec;
      if (spec === undefined) continue;
      if (typeof spec !== "string" || !spec.includes("#")) {
        throw refuse(
          `Test "${a.fullName}" in ${fileResult.name} has meta.spec ${JSON.stringify(spec)} — ` +
            `it must be the string "<sliceId>#<specId>" (e.g. "storyboard-canvas-self.delete-slice#spec-1").`,
        );
      }
      const state =
        a.status === "passed" ? "passed" : a.status === "failed" ? "failed" : "not_run";
      const file = fileResult.name ? relative(cwd, fileResult.name) : fileResult.name;
      tests.push({
        specTag: spec,
        state,
        testRef: `${file} > ${a.fullName}`,
        implementation: a.meta?.implementation,
      });
    }
  }
  tests.sort((a, b) => (a.testRef < b.testRef ? -1 : a.testRef > b.testRef ? 1 : 0));
  return tests;
}

/**
 * @param {{ report: object, document: { sliceId: string, specifications: object[] }, cwd?: string }} inputs
 * @returns {{ annotations: Record<string, object>, foreignTagCount: number, implementationRefs: Map<string,string> }}
 */
export function deriveAnnotations({ report, document, cwd = process.cwd() }) {
  const specsById = new Map(document.specifications.map((s) => [s.id, s]));
  const tests = collectTaggedTests(report, cwd);

  const statesBySpec = new Map();
  const refsBySpec = new Map();
  const implBySpec = new Map();
  let foreignTagCount = 0;

  for (const test of tests) {
    const hash = test.specTag.indexOf("#");
    const tagSliceId = test.specTag.slice(0, hash);
    const specId = test.specTag.slice(hash + 1);
    if (tagSliceId !== document.sliceId) {
      foreignTagCount += 1; // a tag for another slice's specification document — not this run's business
      continue;
    }
    if (!specsById.has(specId)) {
      throw refuse(
        `Test "${test.testRef}" tags specification "${test.specTag}", but "${specId}" is not an id in ` +
          `${document.sliceId} (known ids: ${[...specsById.keys()].join(", ")}). Fix the tag or re-export first.`,
      );
    }
    const prev = statesBySpec.get(specId);
    const worsted =
      prev === "failed" || test.state === "failed"
        ? "failed"
        : prev === "passed" || test.state === "passed"
          ? "passed"
          : "not_run";
    statesBySpec.set(specId, worsted);
    if (!refsBySpec.has(specId)) refsBySpec.set(specId, []);
    refsBySpec.get(specId).push(test.testRef);

    if (test.implementation !== undefined) {
      const existing = implBySpec.get(specId);
      if (existing !== undefined && existing !== test.implementation) {
        throw refuse(
          `Specification "${test.specTag}" is tagged by tests naming two different implementations ` +
            `(${JSON.stringify(existing)} and ${JSON.stringify(test.implementation)}) — they must agree.`,
        );
      }
      implBySpec.set(specId, test.implementation);
    }
  }

  for (const [specId, impl] of implBySpec) {
    const file = impl.split("#")[0];
    if (!file || impl.includes("..") || !existsSync(resolve(cwd, file))) {
      throw refuse(
        `Specification "${document.sliceId}#${specId}" declares implementation ${JSON.stringify(impl)}, ` +
          `but ${JSON.stringify(file)} does not exist in this checkout.`,
      );
    }
  }

  const lastRunAt = new Date(report.startTime ?? Date.now()).toISOString();
  const annotations = {};
  for (const specId of [...statesBySpec.keys()].sort()) {
    annotations[specId] = {
      ...(implBySpec.has(specId) ? { implementationRef: implBySpec.get(specId) } : {}),
      verificationStatus: {
        state: statesBySpec.get(specId),
        testRef: refsBySpec.get(specId).join("; "),
        lastRunAt,
      },
    };
  }
  return { annotations, foreignTagCount, implementationRefs: implBySpec };
}

/**
 * Gate rule: every specification in the document must carry an annotation
 * whose test passed in this run and whose implementationRef was derived.
 * Returns one line per violation; empty means the document is honestly green.
 */
export function gateViolations({ document, annotations }) {
  const violations = [];
  for (const spec of document.specifications) {
    const annotation = annotations[spec.id];
    if (!annotation) {
      violations.push(
        `GATE FAIL ${spec.id} (${spec.title}): no test in this run declares it — no test in the vitest ` +
          `report carries meta.spec "${document.sliceId}#${spec.id}".`,
      );
      continue;
    }
    const state = annotation.verificationStatus?.state;
    if (state !== "passed") {
      violations.push(
        `GATE FAIL ${spec.id} (${spec.title}): verification state is ${JSON.stringify(state)}, not "passed" ` +
          `(tests: ${annotation.verificationStatus?.testRef ?? "<none>"}).`,
      );
    }
    if (!annotation.implementationRef) {
      violations.push(
        `GATE FAIL ${spec.id} (${spec.title}): tagged tests declare no meta.implementation "<file>#<symbol>".`,
      );
    }
  }
  return violations;
}

function gitCommit(cwd) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

// --- CLI wrapper -------------------------------------------------------------
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.report || !args.specifications || !args.annotationsOut) {
    console.error(
      "Usage: node derive-annotations.mjs --report <vitest.json> --specifications <specifications.json> --annotations-out <annotations.json> [--document-out <file>] [--commit <sha>] [--run-id <id>] [--gate]",
    );
    process.exit(1);
  }

  const report = JSON.parse(readFileSync(args.report, "utf8"));
  const document = JSON.parse(readFileSync(args.specifications, "utf8"));

  let outcome;
  try {
    outcome = deriveAnnotations({ report, document });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const generatedAt = new Date(report.startTime ?? Date.now()).toISOString();
  const commit = args.commit ?? gitCommit(process.cwd());
  const derivedFrom = {
    generator: "scripts/derive-annotations.mjs",
    commit,
    testRun: args.runId ?? null,
    report: relative(process.cwd(), resolve(args.report)),
    generatedAt,
  };

  writeFileSync(args.annotationsOut, JSON.stringify(outcome.annotations, null, 2) + "\n");
  console.error(
    `[derive] ${Object.keys(outcome.annotations).length}/${document.specifications.length} specifications of ` +
      `"${document.sliceId}" tagged by tests in this run` +
      (outcome.foreignTagCount ? ` (${outcome.foreignTagCount} tag(s) for other sliceIds ignored)` : "") +
      `; annotations → ${args.annotationsOut}`,
  );

  if (args.documentOut) {
    const derived = { ...document, derivedFrom };
    mkdirSync(dirname(resolve(args.documentOut)), { recursive: true });
    writeFileSync(args.documentOut, JSON.stringify(derived, null, 2) + "\n");
    console.error(`[derive] provenance (${commit ? commit.slice(0, 10) : "no commit"}${args.runId ? ", run " + args.runId : ""}) → ${args.documentOut}`);
  }

  if (args.gate) {
    const violations = gateViolations({ document, annotations: outcome.annotations });
    if (violations.length > 0) {
      for (const v of violations) console.error(v);
      console.error(`[gate] ${violations.length}/${document.specifications.length} specification(s) of "${document.sliceId}" are not verified by a passing test in this run.`);
      process.exit(1);
    }
    console.error(`[gate] all ${document.specifications.length} specification(s) of "${document.sliceId}" verified by a passing test in this run.`);
  }
}
