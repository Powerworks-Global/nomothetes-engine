#!/usr/bin/env node
// Slipway-inspired one-commit bootstrap for a FRESH project seeded from
// this repo as a template — NOT meant to run against nomothetes-engine
// itself, which already has real history (see AGENTS.md's own note on this).
// Asks a handful of foundational questions, writes nomothetes.config.json
// through the existing preset system (src/presets/catalog.ts) rather than
// inventing a parallel config mechanism, updates package.json's name, and
// makes exactly one commit.
//
// Refuses to run against a directory that already has more than one real
// commit — that's the guard against accidentally destroying an existing
// project's history; a fresh `git init` (0 commits) or a single starting
// commit (e.g. from a template-copy tool) are the only cases this is for.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const ALLOWED = {
  "vcs.provider": ["github", "gitlab", "bitbucket", "azure"],
  "integration.targetStack": ["cratis-net", "marten-net", "react-node", "other"],
  "agent.autonomyLevel": ["read-only", "propose-only", "write-with-review", "autonomous"],
};

/**
 * Pure: turn raw answers into the config this bootstrap will write.
 * Exported separately from the CLI/git-mutating parts below so it's
 * unit-testable without touching the filesystem or git.
 */
export function buildBootstrapPlan({ projectName, vcsProvider, targetStack, autonomyLevel }) {
  if (!projectName || projectName.trim().length === 0) {
    throw new Error("buildBootstrapPlan: projectName is required");
  }
  for (const [key, value] of Object.entries({
    "vcs.provider": vcsProvider,
    "integration.targetStack": targetStack,
    "agent.autonomyLevel": autonomyLevel,
  })) {
    if (!ALLOWED[key].includes(value)) {
      throw new Error(`buildBootstrapPlan: "${value}" is not a valid value for ${key} (expected one of ${ALLOWED[key].join(", ")})`);
    }
  }

  return {
    projectName: projectName.trim(),
    packageName: projectName.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-"),
    config: {
      org: { "vcs.provider": vcsProvider },
      project: { "integration.targetStack": targetStack, "agent.autonomyLevel": autonomyLevel },
      user: {},
    },
  };
}

/** Real-commit count check as a plain function so the refusal condition
 * itself is unit-testable without shelling out to git. */
export function shouldRefuse(commitCount) {
  return commitCount !== 0 && commitCount !== 1;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  const cwd = process.cwd();

  if (existsSync(join(cwd, ".git"))) {
    let commitCount = 0;
    try {
      commitCount = Number(execSync("git rev-list --count HEAD", { cwd }).toString().trim());
    } catch {
      commitCount = 0; // no HEAD yet — a genuinely fresh `git init`
    }
    if (shouldRefuse(commitCount)) {
      console.error(
        `bootstrap.mjs: refusing to run — this directory already has ${commitCount} commits. ` +
          "This script is for a genuinely fresh project (0 or 1 starting commits), not an existing project's history. Aborting.",
      );
      process.exit(1);
    }
  }

  // Deliberately not sequential rl.question() calls: when stdin is a pipe
  // rather than a TTY (e.g. piped/scripted answers, as the test harness
  // does), Node's readline/promises interface can close after consuming
  // the pipe's buffered input, leaving later question() calls hanging on
  // an already-closed interface. The async-iterator form below reads
  // exactly one line per prompt and works the same way whether stdin is a
  // TTY or a pipe.
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  try {
    const prompts = [
      "Project name: ",
      `VCS provider [${ALLOWED["vcs.provider"].join("/")}] (default github): `,
      `Target stack [${ALLOWED["integration.targetStack"].join("/")}] (default react-node): `,
      `Agent autonomy level [${ALLOWED["agent.autonomyLevel"].join("/")}] (default write-with-review): `,
    ];
    const answers = [];
    process.stdout.write(prompts[0]);
    for await (const line of rl) {
      answers.push(line);
      if (answers.length === prompts.length) break;
      process.stdout.write(prompts[answers.length]);
    }

    const [projectName, vcsProviderRaw, targetStackRaw, autonomyLevelRaw] = answers;
    const vcsProvider = vcsProviderRaw || "github";
    const targetStack = targetStackRaw || "react-node";
    const autonomyLevel = autonomyLevelRaw || "write-with-review";

    const { projectName: name, packageName, config } = buildBootstrapPlan({ projectName, vcsProvider, targetStack, autonomyLevel });

    writeFileSync(join(cwd, "nomothetes.config.json"), JSON.stringify(config, null, 2) + "\n");

    const pkgPath = join(cwd, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      pkg.name = packageName;
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    }

    if (!existsSync(join(cwd, ".git"))) {
      execSync("git init -q", { cwd });
    }
    execSync("git add -A", { cwd });
    execSync(`git commit -q -m "Initial commit on main: bootstrap ${name}"`, { cwd });
    console.log(`\nBootstrapped "${name}" with one clean commit.`);
  } finally {
    rl.close();
  }
}
