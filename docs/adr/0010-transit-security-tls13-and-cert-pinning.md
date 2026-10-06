# ADR 0010: Transit security — TLS 1.3, certificate pinning for key-service calls

**Status:** Accepted, 2026-10-06

## Context

ADR 0007 (BYOK) made the customer's key-wrapping service a required round-trip on every operation that needs a board's key, and ADR 0009 ruled out caching the unwrapped result. That means the wire between Powerworks's server and the customer's key service carries the single most sensitive call in this whole design — the unwrap request and response — on every real operation, with no caching layer to fall back on if that connection is ever degraded. Transit security for that specific call matters more than it would for an ordinary API integration.

## Decision

1. **TLS 1.3 only, for every connection this system makes or accepts** — the key-service calls (ADR 0007), the board's own git-host API calls (ADR 0006), and any future Alloy/LGTM telemetry egress (ADR 0008). No TLS 1.2 fallback. TLS 1.3 removes several negotiation-time weaknesses TLS 1.2 still carries (static RSA key exchange, several legacy cipher suites) and reduces handshake round-trips, which also partially offsets ADR 0009's "no caching, pay the round-trip every time" cost.
2. **Certificate pinning specifically for the customer's key-wrapping service connection** — not blanket pinning for every outbound call this system makes. The key-service call is the one connection where a successful MITM doesn't just intercept traffic, it can return a forged "unwrap succeeded" response or substitute a different key entirely, silently defeating ADR 0007's entire guarantee. Pinning here means validating the key service's certificate (or its public key) against a value the customer provides at setup, not just trusting whichever CA happens to have signed whatever certificate is presented at connection time.
3. **No pinning for git-host API calls (GitHub/GitLab/etc.) or general internet egress** — these are high-churn, widely-trusted, frequently-rotated certificate environments (major CAs, automated rotation); pinning them creates an outage risk (a legitimate cert rotation breaking the connection) disproportionate to the marginal security gain over standard CA validation, which is already adequate there.

## Reasoning

Why TLS 1.3 universally rather than "wherever we remember to configure it": a stated default removes the chance of a new integration silently defaulting to an older negotiated version because nobody thought to set a minimum.

Why pinning is scoped to the key service specifically, not everywhere: pinning is a tool with a real failure mode of its own — pin the wrong thing, or fail to update a pin before a legitimate rotation, and you've built a self-inflicted outage. It earns its cost only where the thing being protected (here: the unwrap call, per ADR 0007/0009's own reasoning) is worth that risk. Applying it uniformly "to be safe" is the same class of mistake as ADR 0009 warns against for caching — treating a blanket policy as automatically safer than a scoped one, when the blanket version actually just moves the risk around (from MITM exposure to self-inflicted breakage) rather than reducing it.

## Consequences

- **Real new operational surface**: the customer's pinned certificate/public key has to be captured at setup and updated through a deliberate, customer-initiated process when they rotate their key service's certificate — an unannounced rotation on the customer's side becomes an outage for that customer's unwrap calls specifically, by design (fail closed, not fail open to an unpinned connection).
- **Nothing in this codebase implements TLS configuration or pinning yet** — there's no HTTP client, no key-service integration, no git-host API client built at all. This ADR states the constraint those integrations have to satisfy when they're built, same sequencing as every ADR since 0005.

## Related

[ADR 0007](0007-byok-customer-held-keys-for-board-data-at-rest.md) (the key-unwrap call this ADR's pinning decision protects); [ADR 0009](0009-no-caching-of-unwrapped-keys-or-decrypted-content.md) (why that call happens on every operation with no caching fallback, raising the stakes on its transit security).
