# Agent Handoff

Current operational handoff for agents working in `benchkit`.

Keep this file short and execution-focused. Product direction lives in
[`../vision-and-roadmap.md`](../vision-and-roadmap.md).

## Read order

1. [`../../AGENTS.md`](../../AGENTS.md)
2. [`../../README.md`](../../README.md)
3. [`../../DEVELOPING.md`](../../DEVELOPING.md)
4. [`../../CODE_STYLE.md`](../../CODE_STYLE.md)
5. [`../README.md`](../README.md)
6. [`../vision-and-roadmap.md`](../vision-and-roadmap.md)

Then read the package or action you are about to change.

## Architecture context

OTLP JSON is the only data format. Every component operates on
`OtlpMetricsDocument`. See [`../otlp-semantic-conventions.md`](../otlp-semantic-conventions.md).

Key types in `@benchkit/format`:

- `OtlpMetricsDocument` — the wire format, used everywhere
- `MetricsBatch` — ergonomic wrapper with `fromOtlp()`, `filter()`, `groupBy*()`, `toOtlp()`
- `MetricPoint` — flat tuple: `{scenario, series, metric, value, unit, direction, role, tags, timestamp}`
- `buildOtlpResult()` — canonical helper for constructing `OtlpMetricsDocument` from parsed benchmarks

All parsers produce `OtlpMetricsDocument` via `buildOtlpResult()`.

## Current execution queue

### Active: OTLP-everywhere action migration

These are sequenced and ready for delegation:

1. **`#251` — Migrate stash action to write OTLP JSON**
   - `parseBenchmarks()` already returns `OtlpMetricsDocument`
   - Stash needs to write `.otlp.json` instead of `BenchmarkResult` JSON
   - Merge monitor OTLP output with benchmark OTLP (merge resourceMetrics arrays)
   - Update summary markdown to traverse OTLP datapoints
   - Can use `MetricsBatch` for summary generation

2. **`#253` — Migrate compare action to accept OTLP input**
   - Rewrite `compareRuns()` to accept `MetricsBatch` or `OtlpMetricsDocument`
   - Read `.otlp.json` baselines from bench-data
   - `ComparisonResult` output stays the same
   - Can run in parallel with #251

3. **`#252` — Migrate aggregate action to read OTLP JSON**
   - Read `.otlp.json` run files
   - Build index/series/view artifacts from OTLP traversal using `MetricsBatch`
   - Depends on #251 (file format)

4. **`#254` — Remove BenchmarkResult type**
   - Final cleanup after #251, #252, #253
   - Delete: `parse-native.ts`, `run-detail-converter.ts`, `BenchmarkResult`/`Benchmark`/`Metric`/`Sample`/`Context` types, `benchmark-result.schema.json`
   - Remove `parseNative` export

### Backlog: docs and product clarity

- `#159`–`#163` — docs cleanup sequence (can be delegated)
- `#63` — simplify CI to use root build command

### Backlog: product features

- `#93` — dataset-local transform layer
- `#83` — `CompetitiveDashboard`
- `#79`, `#81`, `#7` — workflow benchmark ergonomics

### Future: MetricsKit split

Issues `#179`–`#183`, `#189`–`#198` plan splitting benchkit into:

- **MetricsKit** — generic OTLP metrics platform (MetricsBatch, parsers, OTLP conventions)
- **BenchKit** — benchmark domain layer (compare, stash, aggregate, benchmark-specific semantics)

This happens after the OTLP-everywhere migration completes.

## Cross-repo context

- `strawgate/benchkit-demo` uses `@benchkit/chart` and `@benchkit/format`
- Demo repo CI clones benchkit, builds packages, then builds dashboard
- Demo issue `#4` tracks switching from `file:` deps to published npm packages

## Guardrails

1. Do not commit `dist/` bundles. CI builds and pushes them to `main-dist`.
2. All parsers must produce `OtlpMetricsDocument`. Do not reintroduce `BenchmarkResult` in new code.
3. Use `MetricsBatch` for data traversal in actions, not raw OTLP iteration.
4. Add tests for behavior changes.
