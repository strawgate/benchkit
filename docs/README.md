# Benchkit documentation

This directory is the main documentation hub for benchkit.

## Documentation ownership and current truth

Use the active docs with clear ownership:

- [`vision-and-roadmap.md`](vision-and-roadmap.md) owns product direction,
  shipped/open roadmap status, and the active backlog framing.
- [`internal/agent-handoff.md`](internal/agent-handoff.md) is for short-lived
  next-agent execution guidance only.
- `docs/history/*` is archived historical material, not the current source of
  truth.
- `docs/research/*` captures point-in-time audits or investigations unless the
  guidance is promoted into an active doc.

If an active doc is replaced, move the old material into `history/` or
`research/` instead of leaving two active docs to compete.

## Start here

- [`getting-started.md`](getting-started.md) — end-to-end setup for stash, aggregate, compare, monitor, and charts
- [`reference/actions.md`](reference/actions.md) — overview of all GitHub Actions and when to use each one
- [`reference/react-components.md`](reference/react-components.md) — guide to the main React/Preact component surfaces and chart primitives

## Workflow and product guides

- [`workflow-architecture.md`](workflow-architecture.md) — recommended producer/aggregate workflow split
- [`migration-beats-bench.md`](migration-beats-bench.md) — migration guide from `beats-bench`
- [`vision-and-roadmap.md`](vision-and-roadmap.md) — source of truth for product direction and roadmap status

## Data and architecture references

- [`artifact-layout.md`](artifact-layout.md) — emitted files on the `bench-data` branch
- [`otlp-semantic-conventions.md`](otlp-semantic-conventions.md) — benchkit semantics layered on OTLP
- [`otlp-aggregation-architecture.md`](otlp-aggregation-architecture.md) — OTLP-first aggregation direction
- [`../schema/README.md`](../schema/README.md) — schema reference for native and derived files

## Package and action references

- [`../packages/format/README.md`](../packages/format/README.md) — format package API and examples
- [`../packages/chart/README.md`](../packages/chart/README.md) — chart package API and prop reference
- [`../actions/stash/README.md`](../actions/stash/README.md)
- [`../actions/aggregate/README.md`](../actions/aggregate/README.md)
- [`../actions/compare/README.md`](../actions/compare/README.md)
- [`../actions/monitor/README.md`](../actions/monitor/README.md)
- [`../actions/emit-metric/README.md`](../actions/emit-metric/README.md)

## Internal, historical, and research docs

These are useful, but they are not the main user path:

- [`internal/agent-handoff.md`](internal/agent-handoff.md) — current next-agent execution handoff, not the roadmap/status owner
- [`history/architecture-review.md`](history/architecture-review.md) — historical architecture review
- [`history/plans.md`](history/plans.md) — historical planning notes
- [`research/copilot-playwright-audit.md`](research/copilot-playwright-audit.md) — point-in-time demo-site audit
