# Inventory: Benchmark-Opinionated Aggregation Defaults

This document identifies which aggregation behaviors in the Benchkit platform are generic mechanics versus benchmark-specific defaults, as part of Phase #181.

## 1. Benchmark-Opinionated Behaviors
These behaviors encode assumptions specific to performance benchmarking (e.g., run comparisons, PR views, benchmark-oriented labels).

### Actions (Aggregation & Views)
- **Iteration Averaging:** In `actions/aggregate/src/aggregate.ts`, `buildSeries` averages multiple benchmarks with the same name and tags within a single run (e.g., Go `-count=N`) and computes the range.
- **Monitor Metric Prefixing:** `resolveMetricName` in `actions/aggregate/src/aggregate.ts` prefixes metrics with `_monitor/` if the benchmark name starts with `_monitor/`, allowing the dashboard to partition them.
- **PR Ref Parsing:** `extractPrNumber` and `buildPrIndex` in `actions/aggregate/src/views.ts` encode the specific GitHub PR ref format (`refs/pull/\d+/merge`).
- **Ref-Based Grouping:** `buildRefIndex` groups runs by their Git ref, assuming a ref-centric navigation model.

### Format & Comparison
- **Directionality Inference:** `packages/format/src/infer-direction.ts` contains hardcoded heuristics for benchmark units (e.g., `ops/s` is better when bigger, `ns/op` is better when smaller).
- **Regression Logic:** `packages/format/src/compare.ts` implements the core benchmark comparison logic, including percentage-based threshold tests and "improved/stable/regressed" status assignment.
- **Run Detail Conversion:** `packages/format/src/run-detail-converter.ts` provides a bridge between the "Run Detail" view and the core `BenchmarkResult` format specifically for comparison purposes.

### Dashboard & Charts
- **Benchmark-Oriented Labels:** `packages/chart/src/dashboard-labels.ts` defines labels like "Regression detected", "Winner:", "Leaderboard", and "Runner metrics".
- **Metric Partitioning:** `packages/chart/src/RunDetail.tsx` partitions snapshots into "user metrics" and "monitor metrics" based on the `_monitor/` prefix.
- **Baseline Resolution:** `packages/chart/src/RunDashboard.tsx` includes logic to auto-select baselines based on the `main` branch or specific PR/Ref indices.

## 2. Generic Aggregation Mechanics
These behaviors are generic platform mechanics that form the core of the aggregation system.

- **Index Building:** The basic mechanic of listing runs, their timestamps, and associated metadata (`buildIndex` in `aggregate.ts`).
- **Series Building:** The generic process of grouping data points by a unique key over time to form a history.
- **Pruning:** Generic logic for maintaining a fixed window of history (`pruneRuns`).
- **File I/O & Persistence:** Reading and writing the `data/` branch structure (`index.json`, `series/*.json`).
- **Dataset Transforms:** Generic filtering, grouping by tags, and basic mathematical aggregation (`sum`, `avg`, `max`) in `packages/chart/src/dataset-transforms.ts`.
- **Chart.js Integration:** Converting internal data points to standard `{x, y}` coordinates for visualization.

## 3. Recommended Layering Points (Phase #181)
To split these responsibilities, the following architectural boundaries are proposed:

1. **Aggregation Core:** A generic "Series Aggregator" that handles file persistence and basic point collection.
2. **Benchmark Layer (Plugin):**
   - Provides the `IterationAveraging` logic.
   - Provides the `MonitorPrefixing` rule.
   - Registers the `PrIndex` and `RefIndex` view generators.
3. **Comparison Service:** A standalone service/module that takes two results and a `MetricPolicy` (replacing hardcoded directionality) to produce a verdict.
4. **Customizable Dashboard:** Decoupling `RunDashboard` from benchmark-specific UI concepts so it can be used for generic telemetry (e.g., by making the "Monitor" partition optional and labels fully configurable).
