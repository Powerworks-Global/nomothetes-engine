# ADR 0008: Telemetry carries usage statistics only — never board content

**Status:** Accepted, 2026-10-06

## Context

ADR 0007 adopted BYOK for board content at rest, and named a real remaining risk honestly rather than assuming it away: "any feature... persisting plaintext anywhere (a cache, a log line, a debug dump) would silently violate this ADR's actual guarantee." That risk is not hypothetical — accidental sensitive-data leakage through application logs, traces, and metrics is one of the most common real-world data-exposure vectors in production systems (a stack trace that includes a request payload, a debug log line that dumps an object, a trace span attribute set to "whatever was in scope"). BYOK protects data at rest; it says nothing about what an observability pipeline captures in flight unless that boundary is stated and enforced separately.

The operational stance, confirmed directly: traffic is encrypted in transit (TLS), data at rest is encrypted (ADR 0007's BYOK), and the **only** thing the application emits to its observability stack is usage statistics — routed via Grafana Alloy to an LGTM stack (Loki/Grafana/Tempo/Mimir). This is the same stack AgentOS already adopted for its own observability (WS4.4, 2026-09-11) — reused here deliberately, not reinvented.

## Decision

**The telemetry pipeline (application code → Alloy → LGTM) is scoped to usage statistics only. No board content — node labels, Rule/Example/Question text, scenario text, repo paths, or anything else a facilitator or participant typed — ever reaches a log line, a trace span, or a metric label.**

Concretely:
- **Metrics** (Mimir/Prometheus-shaped): counts and durations only — e.g. "a `place_element` call happened," "an Interview pass took N ms," "a board reached `readyForHandoff`." Never a board's actual label/content as a metric value or label.
- **Traces** (Tempo): span names and timing for operations (`boardPathFor`, `editExampleMap`, an Interview pass) — span attributes carry operation metadata (which skill, which outcome: applied/rejected/halted) never the content of what was placed.
- **Logs** (Loki): structured log lines describing *that* an operation happened and its outcome — same discipline `agentic-worker.mjs`'s existing `progress.txt` already follows (session id, task id, skill name, outcome) — never the board content that operation touched.

This is a data-minimization boundary enforced by what the telemetry-emitting code is allowed to construct, not a redaction/scrubbing step applied after the fact to data that already contains content — redaction-after-the-fact is exactly the pattern that leaks in production the moment someone adds a new log line and forgets the scrub rule applies to it too.

## Reasoning

Why data-minimization-at-the-source rather than redaction: a scrubber has to enumerate every field that might ever contain content and keep that list current as the codebase grows — one missed field is a real leak. A telemetry call that's only ever constructed from counts, durations, and enum-shaped outcomes (never from a board object, a node, or a card) cannot leak content, because it was never given the content to begin with. This matches the same discipline already used elsewhere in this codebase: `run_wdyt` returns structured findings, never a raw content dump; `ambiguity-score.mjs`'s dimensions are counts and ratios with a `detail` string describing the *shape* of the finding, not the content itself.

Why this belongs in its own ADR rather than folded into 0007: BYOK and telemetry minimization are enforced in different places by different mechanisms (storage-layer key wrapping vs. a discipline on what telemetry call sites are allowed to pass) and can fail independently of each other — BYOK could be implemented perfectly while a stray log line still leaks content, which is exactly the gap this ADR exists to close explicitly rather than leave implied.

## Consequences

- **A real engineering checklist item, not automatic**: any new feature that adds a log line, trace span, or metric must be reviewed against "does this ever receive a board object, node, or card as an argument, even indirectly" — the same review discipline a security-conscious team would already apply to PII, applied here to customer IP/business-flow content.
- **Debugging gets harder in exchange for this guarantee** — a production issue with a specific board's actual content can't be diagnosed from Loki/Tempo/Mimir alone, by design. Reproducing an issue requires either the customer's own cooperation (sharing the specific board, under their own control) or a synthetic repro — the same constraint `smoke-test.mjs` already lives under (synthetic content, never real customer data).
- **Nothing in this codebase currently emits telemetry at all** — `agentic-modeling/progress.txt` is the closest existing analog (structured, outcome-only, no content), and already satisfies this ADR's discipline by construction. Wiring an actual Alloy/LGTM pipeline is real future work, not done by this ADR.

## Related

[ADR 0007](0007-byok-customer-held-keys-for-board-data-at-rest.md) (the at-rest guarantee this ADR closes the "in-flight observability" gap next to); AgentOS's WS4.4 (2026-09-11, the LGTM stack adoption this reuses rather than reinventing).
