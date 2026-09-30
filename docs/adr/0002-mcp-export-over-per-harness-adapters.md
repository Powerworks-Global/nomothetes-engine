# ADR 0002: Export the board via MCP, not per-harness adapters

**Status:** Accepted, 2026-09-02

## Context

The board needs to be consumable by AI coding harnesses (Claude Code, Gemini CLI, etc.) to actually drive downstream code generation. The original plan was a harness-adapter layer: a Claude-flavored Markdown/spec exporter, a Gemini-flavored one, a generic-Markdown fallback — one hand-built exporter per target harness.

Researching Ouroboros (`github.com/Q00/ouroboros`, an open-source "Agent OS" for spec-first AI coding) surfaced a different approach: it supports 13 different harnesses through one unified MCP integration, not 13 separate exporters.

## Decision

Expose the board as an MCP server (`mcp-server/`) instead of building per-harness export adapters.

## Reasoning

MCP is already the protocol most major coding harnesses speak natively. Hand-building N adapters means N pieces of format-translation code to maintain, each one a potential source of drift from the canonical data. A single MCP server, consumed by any MCP-compatible client, collapses that to one integration point.

## Consequences

- The canonical data representation (`src/data/powergym-board.json`'s node/edge schema) becomes the thing that matters — the MCP server is a thin protocol wrapper over it, not a second source of truth.
- A harness without MCP support isn't covered by this approach and would still need a bespoke integration — acceptable for now since the harnesses actually in scope (Claude Code, Version1's planned "First Mate" orchestrator per the brief) are MCP-compatible.
- v1 scope is read-only. Writing back to the board via MCP (the Agentic Modeling capability) is explicitly out of scope for this decision — see [docs/plan.md](../plan.md) Phase 4.
