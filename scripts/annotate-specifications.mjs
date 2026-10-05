#!/usr/bin/env node
// Closes the loop export-specifications.mjs's header describes: merges
// real implementation/verification evidence into a specifications.json
// that export-specifications.mjs produced with implementationRef and
// verificationStatus both null.
//
// This script knows nothing about boards or code — it only merges a
// human- or CI-authored annotations file onto a matching spec id. Where
// that evidence actually comes from (a developer noting which function
// satisfies a spec, a CI job parsing its own test-runner output) is out
// of scope here and deliberately not automated yet — see docs/plan.md
// Phase 7's "wiring into the downstream harness's mechanical build gate"
// for what full automation of this would require.
//
// Annotations file shape — a map keyed by the spec's `id`:
//   {
//     "spec-1": {
//       "implementationRef": "src/eval/policy.py#ScopePolicyGate.check",
//       "verificationStatus": {
//         "state": "passed",                              // or "failed" | "not_run"
//         "testRef": "tests/test_policy.py::test_wildcard_scope_denies_non_matching_prefix",
//         "lastRunAt": "2026-10-05T12:00:00.000Z"
//       }
//     }
//   }
// Both fields on an entry are optional — annotate just implementationRef,
// just verificationStatus, or both, independently and incrementally.
//
// Usage: node scripts/annotate-specifications.mjs --input specifications.json --annotations annotations.json > specifications.annotated.json

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VALID_STATES = new Set(["passed", "failed", "not_run"]);

function parseArgs(argv) {
  const args = { input: null, annotations: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.input = argv[++i];
    else if (argv[i] === "--annotations") args.annotations = argv[++i];
  }
  return args;
}

/**
 * @param {{ sliceId: string, specifications: object[], warnings: string[] }} exported
 * @param {Record<string, { implementationRef?: string, verificationStatus?: object }>} annotations
 * @returns {{ result: object, warnings: string[] }}
 */
export function annotateSpecifications(exported, annotations) {
  const byId = new Map(exported.specifications.map((s) => [s.id, s]));
  const warnings = [];

  for (const [specId, annotation] of Object.entries(annotations)) {
    const spec = byId.get(specId);
    if (!spec) {
      const err = new Error(
        `Refusing to annotate: "${specId}" does not match any specification id in the input ` +
          `(known ids: ${[...byId.keys()].join(", ") || "<none>"}). Fix the typo or re-export first.`,
      );
      err.isRefusal = true;
      throw err;
    }

    if ("implementationRef" in annotation) {
      spec.implementationRef = annotation.implementationRef;
    }

    if ("verificationStatus" in annotation) {
      const status = annotation.verificationStatus;
      if (status !== null && !VALID_STATES.has(status?.state)) {
        const err = new Error(
          `Refusing to annotate "${specId}": verificationStatus.state must be one of ` +
            `${[...VALID_STATES].join(", ")} (got ${JSON.stringify(status?.state)}).`,
        );
        err.isRefusal = true;
        throw err;
      }
      spec.verificationStatus = status;
    }
  }

  const unannotated = exported.specifications.filter(
    (s) => s.implementationRef === null && s.verificationStatus === null,
  );
  for (const s of unannotated) {
    warnings.push(`"${s.id}" (${s.title}) has no implementationRef or verificationStatus — still unverified.`);
  }

  return { result: exported, warnings };
}

// --- CLI wrapper -------------------------------------------------------------
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.annotations) {
    console.error("Usage: node annotate-specifications.mjs --input <specifications.json> --annotations <annotations.json>");
    process.exit(1);
  }

  const exported = JSON.parse(readFileSync(args.input, "utf8"));
  const annotations = JSON.parse(readFileSync(args.annotations, "utf8"));

  let outcome;
  try {
    outcome = annotateSpecifications(exported, annotations);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  for (const w of outcome.warnings) console.error(`[warn] ${w}`);
  console.log(JSON.stringify(outcome.result, null, 2));
}
