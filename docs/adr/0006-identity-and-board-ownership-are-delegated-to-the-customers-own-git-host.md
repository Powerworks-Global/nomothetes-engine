# ADR 0006: Identity and board ownership are delegated to the customer's own git host — never Nomothetes-owned infrastructure

**Status:** Accepted, 2026-10-06 — scope narrowed by [ADR 0007](0007-byok-customer-held-keys-for-board-data-at-rest.md), 2026-10-06: this ADR delivers credential custody and revocability, not content confidentiality from Powerworks staff during active use. Read ADR 0007 alongside this one; don't treat this ADR alone as "staff can't see the data."

## Context

ADR 0005 decided that a board lives in the target project's own git repo, not this engine's. That decision alone doesn't answer a question raised directly, immediately after: for any tier above Open Source (Solo, Small Team, Enterprise — see the pricing strategy), a customer will reasonably assume that **Nomothetes's own maintainers cannot see their board's content** — their business flows, their requirements, their IP — unless a maintainer happens to also be the facilitator running their workshop. ADR 0005 says *where the data lives*; it says nothing yet about *who can reach it*, and those are genuinely separate claims. "Not in this engine's repo" stops the engine from being a junk drawer. It does not, by itself, stop a future hosted-convenience feature from quietly routing board content through infrastructure Nomothetes-the-company operates.

The wrong way to answer this is a permissions table Nomothetes builds and maintains — any access-control layer the product itself owns is a thing that can be misconfigured, bypassed, or quietly widened ("just let support see it to debug this ticket"). A policy promise ("we won't look") is not a guarantee a security-conscious customer, or this project's own GRC-literate positioning, should accept as the actual answer.

## Decision

**Identity and board ownership are both delegated to the customer's own git host (GitHub, GitLab, or a self-hosted equivalent) — Nomothetes never becomes a second source of truth for either.**

1. **"Logging in" is delegated identity, not a Nomothetes-owned account system.** A facilitator authenticates via their own git host's OAuth. Nomothetes never issues, stores, or resets a primary credential — there is no Nomothetes password to compromise, and no Nomothetes-side account database holding anyone's identity.
2. **"Adding a board" creates the target repo on the customer's own git host account/org**, using an OAuth token scoped to repo-creation on *their* account — never on a Nomothetes-owned org. From the git host's own perspective, the customer owns the repo, unambiguously, the same as any repo they created by hand.
3. **Authorization to see a board is never a table Nomothetes builds.** It is exactly whatever the git host already enforces for that repo's collaborators. Nomothetes rides on access control that already exists, that the customer already understands and controls, rather than building a second one that can drift out of sync with the first.
4. **A Nomothetes maintainer sees a board only by being an explicit collaborator on that specific repo** — the identical path any third-party contractor would need: granted by the customer, visible in the customer's own repo settings, revocable by the customer at any time, logged in the git host's own audit trail rather than a Nomothetes-internal one that the customer can't inspect. "Unless they are the facilitator" is not a role Nomothetes assigns internally; it reduces to "unless the customer added them as a collaborator," which is just how the git host already works for everyone.
5. **If a hosted-convenience tier is ever built** (not currently planned, but worth binding now rather than after someone has half-built it under time pressure): Nomothetes's own servers must be a stateless pass-through, using the customer's own delegated OAuth token for every board read/write, never a data store of record for board content. The moment a Nomothetes-operated database holds a persistent copy of a customer's board "for performance" or "for a dashboard," this ADR's guarantee is void — it becomes privacy-by-policy, which this decision explicitly rejects as insufficient.

## Reasoning

Why delegated identity/ownership instead of a Nomothetes-built permissions layer: the only guarantee worth trusting is one where maintainers have **no technical path** to the data, not one where they technically could but promise not to. A second, Nomothetes-owned authorization system is itself an attack surface and a trust liability, and it inevitably drifts from the git host's own access control over time (a removed GitHub collaborator doesn't automatically revoke a stale Nomothetes-side grant unless every such system is kept in lockstep — a maintenance burden with a real failure mode: silent over-access). Reusing the git host's own enforcement means there is exactly one place access is granted or revoked, and it's the place the customer already looks.

Why this binds self-hosted and future-hosted tiers the same way: Open Source/self-hosted already satisfies this trivially (Nomothetes has no running process near the data at all). The risk is entirely in future convenience features for paid tiers — white-labeling, a hosted dashboard, "we'll just run it for you" — which is exactly where a well-intentioned shortcut would quietly reintroduce a Nomothetes-side copy of customer data. Stating the constraint now, before any hosted tier exists, means it has to be designed around rather than retrofitted or quietly violated.

## Consequences

- **No Nomothetes-owned user database.** Whatever "sign in" UI exists is an OAuth handshake against the customer's chosen git host, not a credentials form Nomothetes validates itself.
- **Repo-creation requires a real OAuth scope grant from the customer** (repo-creation permission on their own account/org) — this is new, real integration work (git host API client, OAuth flow, token storage/refresh on whichever side runs the engine) not yet built anywhere in this codebase. Named here as the next real piece, not assumed solved by this ADR.
- **No Nomothetes-side "who can see board X" table, ever** — any future feature that seems to need one (e.g. a facilitator-only dashboard across multiple customer boards) must be re-derived from the git host's own collaborator/org-membership APIs at query time, not cached into a Nomothetes-owned store that could go stale or leak.
- **A hosted-convenience tier, if ever pursued, has a hard architectural constraint stated in advance**: stateless pass-through only. This forecloses certain product shortcuts (e.g. a central searchable index of every customer's board content) unless they're built as client-side/customer-controlled features instead.
- **This is a stated commitment, not yet an enforced one.** Nothing in this codebase currently implements OAuth, repo-creation, or any identity flow at all — ADR 0005 already named that gap, and this ADR adds the privacy constraint that whatever fills it must satisfy, rather than retrofitting it after a simpler-but-wrong version ships.

## Related

[ADR 0005](0005-board-storage-lives-outside-this-repo.md) (board storage lives outside this repo; this ADR adds *who can reach it* on top of *where it lives*); the pricing/GTM strategy (vault: `Nomothetes — Product Strategy & Compliance`) this ADR's tier-scoping (Solo/Small Team/Enterprise) refers to.
