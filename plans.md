# Benchkit Plans (Historical)

This file is an old planning scratchpad from an earlier phase of the project.
It predates several features that are now already shipped on `main`, including:

- release automation
- PR comparison support
- stash summaries and `save-data-file`
- expanded aggregate artifacts and aggregate-on-push guidance

As a result, this file should **not** be used as the current source of truth for
status or prioritization.

## Use these docs instead

- [`docs/vision-and-roadmap.md`](docs/vision-and-roadmap.md) for the active
  roadmap and open backlog framing
- [`docs/agent-handoff.md`](docs/agent-handoff.md) for current project state
  and handoff notes
- [`docs/otlp-aggregation-architecture.md`](docs/otlp-aggregation-architecture.md)
  and [`docs/otlp-semantic-conventions.md`](docs/otlp-semantic-conventions.md)
  for the OTLP transition work
- [`docs/artifact-layout.md`](docs/artifact-layout.md) for the aggregate data
  layout emitted on `main`

## Monitor note

PR `#101` now tracks the collector-backed monitor work that stores raw OTLP
telemetry sidecars. Keep planning notes aligned with that implementation rather
than the older `/proc` start/stop model.
