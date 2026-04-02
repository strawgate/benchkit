# Benchkit Architecture Review (Historical)

This file began as a pre-release architecture review and release plan.

Large parts of the original document became stale once the following work landed
on `main`:

- release automation (`#38`)
- the PR comparison foundation (`#46`, `#47`, `#48`, `#50`)
- the first emitted set of aggregate view artifacts (`#91`, `#92`)

Because of that, this file should now be treated as **historical context**, not
as the current repository status or roadmap.

## What is still useful here

The original review got several long-lived principles right:

- benchkit should stay zero-infrastructure
- collection, aggregation, and visualization should remain separate concerns
- PR-native benchmarking is a first-class workflow
- runs and scenarios should become the primary UX surfaces
- OTLP is the long-term raw-format direction

## Current source-of-truth docs

For current repository truth, use these documents instead:

1. [`README.md`](README.md) — current product overview and shipped workflows
2. [`docs/vision-and-roadmap.md`](docs/vision-and-roadmap.md) — current open
   roadmap and backlog framing
3. [`docs/agent-handoff.md`](docs/agent-handoff.md) — current handoff / status
   notes for future agents
4. [`docs/otlp-aggregation-architecture.md`](docs/otlp-aggregation-architecture.md)
   — OTLP-first architecture direction
5. [`docs/otlp-semantic-conventions.md`](docs/otlp-semantic-conventions.md) —
   semantic contract for OTLP work
6. [`docs/artifact-layout.md`](docs/artifact-layout.md) — aggregate artifact
   layout already emitted on `main`

## Monitor note

The repository docs intentionally still describe the `/proc`-based monitor
behavior that exists on `main` today.

PR `#101` tracks the collector-backed monitor implementation now present in
this worktree. Keep `README.md`, `actions/monitor/README.md`, workflow examples,
and OTLP storage notes aligned with that implementation.
