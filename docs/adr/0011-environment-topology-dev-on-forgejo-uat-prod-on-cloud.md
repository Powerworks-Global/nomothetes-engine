# ADR 0011: Environment topology — Dev on self-hosted Forgejo, UAT and Prod on cloud (vendor TBD)

**Status:** Accepted, 2026-10-06 — cloud vendor for UAT/Prod explicitly not yet decided; this ADR fixes the topology, not the provider.

## Context

Three environments, each with a different trust/cost profile, need a stated home before any CI/CD or deployment work starts:

- **Dev** — fast-iteration, developer-owned, no uptime guarantee needed.
- **UAT** — pre-production verification, needs to resemble Prod closely enough that a UAT pass means something.
- **Prod** — the real thing, customer-facing, subject to everything ADR 0006 through 0010 already committed to (BYOK, transit security, telemetry minimization, no secret caching).

Running all three on the same infrastructure (e.g. everything on the homelab NAS, or everything on one cloud account from day one) either wastes real money on environments that don't need cloud-grade availability (Dev), or delays getting Prod-shaped infrastructure experience until it's needed under real pressure (UAT/Prod).

## Decision

**Dev runs on self-hosted Forgejo on the operator's own NAS. UAT and Prod run on a cloud provider — which provider is explicitly not yet decided, and this ADR does not pick one.**

1. **Dev**: Forgejo, self-hosted on the NAS (per [ADR 0006](0006-identity-and-board-ownership-are-delegated-to-the-customers-own-git-host.md)'s primary-target decision) — this is also where this engine's own development happens, dogfooding the exact git host the product recommends to customers as the reference target.
2. **UAT**: cloud, provider TBD. Has to be close enough to Prod's actual shape (network topology, the BYOK key-service integration point, the Alloy/LGTM telemetry pipeline) that a UAT pass is evidence about Prod, not a different system that happens to run the same code.
3. **Prod**: cloud, same provider as UAT (not mixed — a UAT/Prod provider split would reintroduce exactly the "does a passing test mean anything" risk UAT exists to remove). Subject to every prior ADR in this set without exception: TLS 1.3 (ADR 0010), BYOK (ADR 0007), telemetry minimization (ADR 0008), no secret caching (ADR 0009).

**Explicitly deferred, not decided here**: which cloud provider. This is a real, separate decision with its own real tradeoffs (confidential-computing support if ADR 0007's future upgrade path is ever taken — AWS Nitro Enclaves is the concrete example already named in ADR 0007's research — data residency for EU/Ireland-based customers, cost, and whatever the ISO 27001/42001 certification path ends up actually requiring of the hosting environment). Naming it here as open, rather than defaulting silently to whatever's convenient, is the point of writing this down before it gets decided by inertia.

## Reasoning

Why Dev stays local/self-hosted rather than cloud from day one: Dev has no customer-facing uptime requirement and no real cost justification for cloud infrastructure — the NAS is already owned, already running (per the existing homelab setup), and self-hosting Dev on Forgejo is free additional proof that the self-hosted path ADR 0006 recommends to customers actually works day-to-day, not just in theory.

Why UAT and Prod share a provider rather than UAT being "whichever cloud is cheapest to test on": a UAT environment on different infrastructure than Prod can pass while Prod fails for reasons specific to the provider difference (networking quirks, IAM model differences, a managed service that behaves differently) — exactly the kind of gap that defeats the purpose of having a UAT stage at all.

Why the cloud vendor decision is deliberately left open rather than guessed at now: picking a cloud provider under this product's constraints (BYOK's confidential-computing upgrade path, EU data residency for the ISO 42001/27001 work already in motion, cost at pre-revenue scale) is a real decision with real research behind it, not a default to reach for just to unblock this ADR. Recording the topology now without prematurely fixing the provider keeps this ADR honest about what's actually decided versus still open.

## Consequences

- **CI/CD design has a real target shape now**: build/test against Dev's Forgejo, promote to UAT on whatever cloud provider is chosen, promote to Prod on the same provider — a pipeline can be designed around this topology before the provider itself is picked, since the topology (three stages, two infra types) doesn't depend on which cloud wins.
- **The cloud vendor decision is now an explicitly tracked open item**, not something to let get decided implicitly by whichever provider someone happens to spin up a test account on first. Candidate criteria to weigh when it's actually decided: EU data residency, confidential-computing support (AWS Nitro Enclaves is the one named precedent so far, per ADR 0007), cost at current scale, and compatibility with whatever the ISO 27001/42001 certification work ends up requiring of the hosting environment.
- **Nothing is deployed anywhere yet.** This ADR fixes where things will live once built; it is not a statement that Dev/UAT/Prod currently exist as running environments.

## Related

[ADR 0006](0006-identity-and-board-ownership-are-delegated-to-the-customers-own-git-host.md) (Forgejo as the primary git-host target, dogfooded here as Dev's home); [ADR 0007](0007-byok-customer-held-keys-for-board-data-at-rest.md) (the confidential-computing upgrade path that's one of the real criteria for the still-open cloud vendor decision); the ISO 27001/42001 certification work (vault: `Nomothetes — Product Strategy & Compliance`, `ISO 42001 Ireland reference`) whose actual requirements will further constrain that same decision.
