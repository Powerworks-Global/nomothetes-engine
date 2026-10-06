# ADR 0009: No caching of unwrapped keys or decrypted board content

**Status:** Accepted, 2026-10-06

## Context

Checked directly against the real codebase before answering, same discipline as every other ADR in this set: **as of this ADR, there is no caching layer anywhere in this codebase** — no server-side cache, no TTL, nothing. A grep for `cache`/`Cache`/`TTL` across every `.mjs`/`.ts`/`.tsx` file returns zero matches. The one thing that resembled a cache — `mcp-server/index.mjs`'s old module-level `board` const, loaded once at server startup and never refreshed — was removed in ADR 0005 specifically *because* it caused a real staleness bug, not replaced with a TTL-based cache.

The forward-looking risk is real, though, and worth binding now rather than after it's built under load pressure: ADR 0007's BYOK design requires an unwrap call to the customer's key-wrapping service on every operation that needs the board's actual key. That is a real network round-trip, every time, which is exactly the kind of latency that invites "just cache the unwrapped key for a short while" as a performance fix. Doing that would quietly undo ADR 0007's entire guarantee — a cached unwrapped key sitting in server memory for any TTL, however short, is available to anything that can read that memory for the duration of the cache, independent of whether the customer has since revoked access at their key service. The same risk category applies to caching *decrypted board content* directly (skip the re-decrypt, cache the plaintext) — and adds a second, distinct failure mode: a cache-key bug serving one tenant's cached content to a different tenant's request, a well-documented class of real SaaS vulnerability (cache poisoning / cross-tenant data exposure), not a hypothetical.

## Decision

1. **Unwrapped keys are never cached, at any TTL, anywhere.** Every operation that needs a board's key calls out to the customer's key-wrapping service fresh. If that round-trip's latency becomes a real, measured problem, the fix is reducing the number of operations that need the key (batching, reducing round-trips architecturally) — never caching the unwrapped key as a shortcut.
2. **Decrypted board content is never cached beyond the single operation that needed it.** The same "transient plaintext in memory during active use" tradeoff ADR 0007 already names and accepts applies *once*, for the duration of one operation — it does not extend into a reusable cache that outlives that operation.
3. **If caching is ever introduced for performance, it is scoped to what's safe to cache**: wrapped/encrypted artifacts (ciphertext is useless without the key, so caching it changes nothing about the guarantee), or non-sensitive derived metadata (counts, ids, timestamps — the same shape ADR 0008 already restricts telemetry to, applied here to caching instead). This is the same data-minimization-at-the-source principle as ADR 0008: a cache that was never given plaintext or an unwrapped key can't leak either, regardless of its TTL or who can read its memory.
4. **Any cache, if one is ever added, must be strictly scoped per-tenant/per-board** — a shared cache keyed loosely enough to serve one customer's entry to another's request is the cross-tenant exposure risk named above, and is treated as a correctness bug exactly as severe as a privacy bug, because here it is one.

## Reasoning

Why bind this now, with no cache yet built: every ADR in this set so far (0006 through 0008) was corrected or added only *after* a real design pressure surfaced the gap — delegated identity's overclaim, telemetry's unstated boundary. Caching is foreseeable enough, and the failure mode severe enough (it silently undoes ADR 0007's entire point), that it doesn't need to wait for a real incident to get a stated answer. The honest alternative to "no caching of secrets" is never "a short TTL is fine" — a short TTL narrows the exposure window, it does not change the exposure's category. ADR 0007 already made this exact distinction for transient in-memory plaintext during active use; this ADR states plainly that a cache is not "active use," it's deliberately extending that window for a performance gain, which is a different and additional risk, not a smaller version of the same one.

## Consequences

- **Performance work that hits key-unwrap latency has a narrower toolbox than "just cache it"** — batching, reducing round-trip count, or (if it ever becomes a real bottleneck) a confidential-computing-shaped approach (ADR 0007's named future option) are the legitimate paths; caching the secret is not one of them.
- **No action needed today** — there's nothing to rip out, because nothing caches anything yet. This ADR is a constraint on what gets built next, not a correction to existing code, unlike ADR 0005 which was both.
- **Future code review checklist item**, same shape as ADR 0008's: any new cache, anywhere, gets checked against "does this ever hold an unwrapped key or decrypted content, even briefly, even at a short TTL" before it ships.

## Related

[ADR 0007](0007-byok-customer-held-keys-for-board-data-at-rest.md) (the key-wrapping design whose unwrap latency is the real pressure this ADR heads off); [ADR 0008](0008-telemetry-is-usage-statistics-only-never-board-content.md) (the same data-minimization-at-source principle, applied to caching instead of telemetry); [ADR 0005](0005-board-storage-lives-outside-this-repo.md) (the one prior thing in this codebase that resembled a cache, removed for staleness, not for this ADR's reason, but the same code).
