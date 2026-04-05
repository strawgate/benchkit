# Benchkit Vision and Roadmap

Source of truth for product direction and roadmap status.

Operational agent sequencing belongs in
[`docs/internal/agent-handoff.md`](internal/agent-handoff.md).

## Product vision

Benchkit is the simplest way to publish, compare, and investigate benchmark
results from GitHub workflows.

Supported benchmark types:

- **Code benchmarks** — `go test -bench`, Rust bench, Hyperfine, pytest-benchmark
- **Workflow benchmarks** — HTTP endpoints, page loads, metric scraping, dataset ingestion
- **Hybrid benchmarks** — custom result metrics plus runner/process telemetry from `actions/monitor`

Core design principles:

- **Metrics are the primitive** — everything is an OTLP metric
- **Runs and scenarios are the primary UX surfaces**
- **OTLP JSON is the only data format** — no intermediate types

## User journeys

1. **Custom metric exploration** — explore arbitrary metrics over time
2. **Competitive benchmarking** — compare implementations, track rank, explain changes
3. **PR and run benchmarking** — compare a PR against baseline, detect regressions

## Architecture

OTLP JSON flows through every layer:

```
parsers → OtlpMetricsDocument → stash → bench-data → aggregate → views → charts
```

Key components:

- **`@benchkit/format`** — parsers, `MetricsBatch`, `buildOtlpResult()`, OTLP types and semantic conventions
- **`@benchkit/chart`** — React/Preact dashboard surfaces (`RunDashboard`, `RunDetail`, trend/comparison charts)
- **`actions/stash`** — writes run data to the `bench-data` branch
- **`actions/aggregate`** — produces index, series, and view artifacts
- **`actions/compare`** — compares runs, posts PR comments
- **`actions/monitor`** — captures runner telemetry during benchmark jobs
- **`actions/emit-metric`** — emits custom OTLP metrics from workflow steps

Semantic conventions: [`otlp-semantic-conventions.md`](otlp-semantic-conventions.md)

## Shipped

- All parsers produce `OtlpMetricsDocument` directly (Go, Rust, Hyperfine, pytest-benchmark, benchmark-action)
- `MetricsBatch` ergonomic wrapper for OTLP data traversal
- `buildOtlpResult()` canonical document builder
- OTLP semantic conventions and validation
- `actions/compare` — `compareRuns()`, `formatComparisonMarkdown()`, PR comments
- `actions/stash` — job summaries, data branch writes, PR run support
- `actions/aggregate` — index, series, run-detail view artifacts
- `actions/monitor` — OTel Collector, OTLP telemetry sidecars
- `actions/emit-metric` — reference OTLP producer
- `@benchkit/chart` — `RunDashboard`, `RunDetail`, trend charts, comparison charts
- Release automation (npm + GitHub releases)
- Producer/aggregate workflow separation with collision-proof run naming
- OTLP parsing, traversal, and validation helpers

## Roadmap

### Phase 1 — Action migration to OTLP (current)

Migrate all actions to operate on `OtlpMetricsDocument` end-to-end:

| Issue | Task | Status |
|---|---|---|
| #251 | Stash: write `.otlp.json`, merge monitor OTLP | Ready |
| #253 | Compare: accept `OtlpMetricsDocument` input | Ready |
| #252 | Aggregate: read `.otlp.json`, build views from OTLP | Blocked on #251 |
| #254 | Remove `BenchmarkResult` type and all legacy code | Blocked on #251–253 |

Exit criteria: zero references to `BenchmarkResult` in the codebase.

### Phase 2 — Docs and product clarity

| Issue | Task |
|---|---|
| #159 | Define current-truth docs and deprecation policy |
| #160 | Clarify `packages/dashboard` role |
| #161 | Migration-readiness and example coverage matrix |
| #162 | Fix public dashboard accessibility |
| #163 | Align chart docs with shipped surfaces |

### Phase 3 — Workflow benchmark ergonomics

Make it easy for new users to benchmark anything:

| Issue | Task |
|---|---|
| #79 | Workflow benchmark starter kit |
| #81 | JSON and Prometheus collector helpers |
| #7 | Integration examples and benchmark recipes |
| #93 | Dataset-local transform layer for chart views |

Exit criteria: a new user can copy a minimal recipe to benchmark an HTTP API,
a stats endpoint, a Prometheus target, or a browser workflow.

### Phase 4 — Dashboard evolution

| Issue | Task |
|---|---|
| #83 | `CompetitiveDashboard` |
| #56 | Export/embed mode for chart components |

Build on `RunDashboard`/`RunDetail` to create scenario-first and
competitive-first experiences.

### Phase 5 — MetricsKit split

Split benchkit into two layers:

- **MetricsKit** — generic OTLP metrics platform (`MetricsBatch`, parsers, conventions, storage)
- **BenchKit** — benchmark domain (compare, aggregate, stash, benchmark-specific semantics)

Tracked by issues `#179`–`#183`, `#189`–`#198`.

### Phase 6 — Advanced query

Optional DuckDB-Wasm analysis mode for power users. Not the default dashboard
dependency.

## Design constraints

- No frontend cross-file joins — aggregate produces view-shaped artifacts
- Monitor/diagnostic metrics belong in run detail, not in overviews
- Avoid over-fitting to only Go microbenchmarks
- Keep the semantic contract small and explicit
