#!/usr/bin/env node
// Prompt sanitization for Agentic Modeling — ported from PowerGym's
// agentic-modeling/CLAUDE.md filter rules (shell-command injection,
// out-of-project reach, off-topic content, instruction-override attempts).
// A task's surviving prompts are what the worker actually routes to a
// skill; anything filtered here never reaches a write tool.
//
// This is deliberately conservative: pattern-matching prose for intent is
// imperfect, so rules err toward dropping anything that looks adversarial
// rather than trying to be clever about allowing edge cases.

import { pathToFileURL } from "node:url";

const SHELL_COMMAND_PATTERNS = [
  /\$\(.+?\)/, // $(...) command substitution
  /`[^`]+`/, // backtick command substitution
  /\b(rm|curl|wget|chmod|chown|sudo|eval|exec)\s+-?\S/i,
  /&&|\|\|/, // shell chaining
  /^\s*(\.\/|~\/)/, // starts with a relative/home-relative shell invocation, e.g. "./script.sh" or "~/bin/x"
  // Deliberately NOT a bare leading "/" — that collides with this worker's
  // own "/skill-name {json}" routing syntax (see agentic-worker.mjs).
];

const OUT_OF_PROJECT_PATTERNS = [
  /\.\.\//, // path traversal
  /\/etc\/|\/home\/|\/root\//i,
  /\benv\b.*\b(secret|token|key|password|credential)/i,
];

const OFF_TOPIC_PATTERNS = [/\b(write me a poem|tell me a joke|what is the weather|who won the)\b/i];

const OVERRIDE_ATTEMPT_PATTERNS = [
  /ignore (all |the )?(previous|prior|above) (instructions|rules)/i,
  /you are now/i,
  /disregard (your|the) (system prompt|instructions)/i,
  /act as (if you (are|were)|a different)/i,
  /\bDAN\b/, // common jailbreak persona name
];

const RULES = [
  { name: "shell-command", patterns: SHELL_COMMAND_PATTERNS },
  { name: "out-of-project", patterns: OUT_OF_PROJECT_PATTERNS },
  { name: "off-topic", patterns: OFF_TOPIC_PATTERNS },
  { name: "override-attempt", patterns: OVERRIDE_ATTEMPT_PATTERNS },
];

/**
 * Sanitize a list of raw prompt strings. Returns `{ kept, dropped }` where
 * `dropped` entries record the prompt and the rule that rejected it, so
 * the worker can log counts (per PowerGym's own convention) without
 * silently discarding anything.
 */
export function sanitizePrompts(prompts) {
  const kept = [];
  const dropped = [];

  for (const prompt of prompts) {
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      dropped.push({ prompt, rule: "empty" });
      continue;
    }

    const violated = RULES.find(({ patterns }) => patterns.some((re) => re.test(prompt)));
    if (violated) {
      dropped.push({ prompt, rule: violated.name });
      continue;
    }

    kept.push(prompt);
  }

  return { kept, dropped };
}

const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (isMain) {
  const prompts = process.argv.slice(2);
  const result = sanitizePrompts(prompts);
  console.log(JSON.stringify(result, null, 2));
}
