# Benchkit

[![CI](https://github.com/strawgate/benchkit/actions/workflows/ci.yml/badge.svg)](https://github.com/strawgate/benchkit/actions/workflows/ci.yml)
[![npm @benchkit/format](https://img.shields.io/npm/v/%40benchkit%2Fformat?label=%40benchkit%2Fformat)](https://www.npmjs.com/package/@benchkit/format)
[![npm @benchkit/chart](https://img.shields.io/npm/v/%40benchkit%2Fchart?label=%40benchkit%2Fchart)](https://www.npmjs.com/package/@benchkit/chart)

**Track benchmarks over time with GitHub Actions and static hosting — no servers required.**

Benchkit helps you collect benchmark results in CI, store them on a `bench-data` branch, compare them in pull requests, and render dashboards from static JSON.

See the live dogfood dashboard at **[strawgate.github.io/benchkit](https://strawgate.github.io/benchkit/)**.

## What Benchkit gives you

- **GitHub Actions for benchmark workflows**: stash raw runs, aggregate derived files, compare PRs, collect monitor telemetry, and emit one-off OTLP metrics.
- **Format and schema tooling**: normalize Go, Rust, Hyperfine, pytest-benchmark, benchmark-action, OTLP, and native JSON into a common shape.
- **Preact chart components**: render dashboards and drilldowns from static files on a `bench-data` branch.
- **No backend to run**: data is stored in Git and served through GitHub's raw-content/CDN paths.

## Good fits

- **Code benchmarks** such as `go test -bench`, Rust benches, Hyperfine, or pytest-benchmark.
- **Workflow benchmarks** such as HTTP checks, JSON stats, Prometheus scrapes, and pipeline throughput metrics.
- **Hybrid runs** that combine outcome metrics with runner or process telemetry via `actions/monitor`.

## Quick taste

A typical setup looks like this:

1. Run benchmarks in CI.
2. Use [`actions/stash`](actions/stash/README.md) to write raw run files to `bench-data`.
3. Use [`actions/aggregate`](actions/aggregate/README.md) to rebuild indexes and views.
4. Optionally use [`actions/compare`](actions/compare/README.md) for PR comments and [`actions/monitor`](actions/monitor/README.md) for OTLP telemetry.
5. Render dashboards with [`@benchkit/chart`](packages/chart/README.md).

For the full setup, examples, and workflow files, start with [`docs/getting-started.md`](docs/getting-started.md).

## Packages and actions

| Surface | What it is | Reference |
|---|---|---|
| `@benchkit/format` | Parsers, types, compare helpers, native result builders | [`packages/format/README.md`](packages/format/README.md) |
| `@benchkit/chart` | Preact dashboards, charts, and fetch helpers | [`packages/chart/README.md`](packages/chart/README.md) |
| `actions/stash` | Store raw run results on the data branch | [`actions/stash/README.md`](actions/stash/README.md) |
| `actions/aggregate` | Build derived indexes, series, and run views | [`actions/aggregate/README.md`](actions/aggregate/README.md) |
| `actions/compare` | Compare current results to a baseline and comment on PRs | [`actions/compare/README.md`](actions/compare/README.md) |
| `actions/monitor` | Collect OTLP host and custom telemetry | [`actions/monitor/README.md`](actions/monitor/README.md) |
| `actions/emit-metric` | Emit a one-off OTLP metric to the monitor collector | [`actions/emit-metric/README.md`](actions/emit-metric/README.md) |

## Documentation

- **Start here**: [`docs/README.md`](docs/README.md)
- **Getting started**: [`docs/getting-started.md`](docs/getting-started.md)
- **Action reference**: [`docs/reference/actions.md`](docs/reference/actions.md)
- **React component guide**: [`docs/reference/react-components.md`](docs/reference/react-components.md)
- **Workflow architecture**: [`docs/workflow-architecture.md`](docs/workflow-architecture.md)
- **Schemas and data contracts**: [`schema/README.md`](schema/README.md)
- **Contributing**: [`DEVELOPING.md`](DEVELOPING.md)

