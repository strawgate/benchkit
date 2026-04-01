# Benchkit Architecture Review & Release Plan

> **Date:** 2026-03-31 | **Version:** 0.1.0 (pre-release) | **Tests:** 207 passing

---

## 1. Competitive Landscape

### The Three Tiers of Benchmark CI Tools

| Tool | Model | Stars | Strengths | Weaknesses |
|------|-------|-------|-----------|------------|
| **[benchmark-action/github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark)** | Single monolithic action, gh-pages data | 1.2k | 11 language parsers, simple setup, broad adoption | No pre-aggregation (all data in one JS file), no PR comments on PRs (only commit comments), no system monitoring, stale dashboard (1 chart per benchmark, no comparison), no series/index split |
| **[Bencher](https://bencher.dev)** | SaaS + self-hosted, Rust server + SQLite | 815 | Statistical thresholds (t-test, z-score, IQR, log-normal, percentage, static), branch-aware, PR comments, testbed concept, 15+ adapters | Requires external service/self-hosting, complex setup, paid features |
| **[CodSpeed](https://codspeed.io)** | SaaS, CPU simulation via Valgrind | 52 | Noise-free simulation mode, bare-metal "macro runners", PR reports, profiling | Proprietary, requires CodSpeed runner/instrumentation, limited to Python/Rust/Node/C++/Go |

### Where Benchkit Sits

Benchkit occupies a unique **middle ground**: serverless like benchmark-action, but with a modern architecture (pre-aggregated series, Preact components, system monitoring). No other tool offers:

1. **Zero-infrastructure** data storage (git branch + raw CDN) with **pre-aggregated series files**
2. **System resource monitoring** (CPU, memory, I/O) as first-class benchmark data alongside user benchmarks
3. **Composable Preact components** that can embed anywhere vs. a fixed dashboard page
4. **Separation of concerns** between collection (stash), aggregation, and visualization

### Gaps vs. Competition

| Feature | benchmark-action | Bencher | CodSpeed | **Benchkit** |
|---------|-----------------|---------|----------|-------------|
| PR comment with comparison | Commit comment only | ✅ Rich table | ✅ Full report | ❌ **Missing** |
| Job summary | ✅ | ❌ | ❌ | ❌ **Missing** |
| Regression fail-on-alert | ✅ (200% default) | ✅ (configurable) | ✅ (checks) | ❌ **Missing** |
| Statistical thresholds | Simple % | t-test, z-score, IQR, log-normal, %, static | Proprietary | Simple rolling mean |
| Branch-aware comparison | ❌ | ✅ (branch selection) | ✅ (PR vs main) | ❌ **Missing** |
| Multi-language parsers | 11 + custom | 15+ adapters | N/A (wraps harnesses) | 3 (Go, benchmark-action, native) |
| System monitoring | ❌ | ❌ | ❌ | ✅ **Unique** |
| Self-contained (no server) | ✅ | ❌ | ❌ | ✅ |
| Embeddable components | ❌ (fixed page) | ❌ (hosted console) | ❌ (hosted) | ✅ **Unique** |

---

## 2. Current Architecture Assessment

### What's Working Well

1. **Data pipeline is solid** — stash → aggregate → series is a clean ETL that scales well with static hosting
2. **Format abstraction** — `BenchmarkResult` type is well-designed, extensible, handles Go/benchmark-action/native cleanly
3. **Monitor action** — unique differentiator, `/proc` polling with process tracking is well-engineered
4. **Schema-first data contract** — JSON schemas validated in CI, clean delineation between data formats
5. **Preact components** — composable, tree-shakeable, each chart is independently usable
6. **Pre-aggregation** — the key insight that makes zero-server dashboards fast; far ahead of benchmark-action's single `data.js` approach
7. **Test coverage** — 207 tests, good coverage across format parsing, aggregation logic, chart utils

### Architectural Concerns

| Area | Issue | Severity | Notes |
|------|-------|----------|-------|
| **Dashboard.tsx** | 350+ lines, mixed state/render/fetch | Low | Functional but hard to extend; fine for v1 |
| **Aggregate composite keys** | String concat `name[tag=val]` | Low | Works but not formally specified; could collide |
| **No PR workflow** | Stash only writes to data branch | **High** | Users can't see performance impact of a PR before merge |
| **No fail-on-regression** | Dashboard detects regressions client-side only | **High** | Regressions merge silently |
| **Action outputs are minimal** | Stash outputs run-id and file-path only | Medium | Not enough for downstream comparison steps |
| **No GitHub API integration** | Actions don't create comments/summaries | **High** | Every competitor has this |
| **Linux-only monitor** | macOS/Windows are no-op | Low | Acceptable, well-documented |
| **Single parser per file** | Can't mix formats in one stash call | Low | Uncommon need |

---

## 3. Architecture Principles for v1

1. **Zero infrastructure** — no servers, no databases, no SaaS; git + CDN + static JS
2. **Composable actions** — each action does one thing; combine them in workflows
3. **Parser-agnostic** — format package handles detection; actions don't care about input format
4. **Schema-first** — data contracts are JSON Schema; breaking changes are versioned
5. **Progressive disclosure** — simple use case = 3 lines of YAML; power users get full props
6. **PR-native** — performance data belongs in the PR, not discovered after merge

---

## 4. Release Architecture

### Package Structure (Keep As-Is)

```
@benchkit/format   (npm)  — types + parsers
@benchkit/chart    (npm)  — Preact components
actions/stash      (GitHub Action, private)
actions/aggregate  (GitHub Action, private)
actions/monitor    (GitHub Action, private)
```

This structure is correct. The npm packages are independently installable for custom dashboards, and the actions are consumed via `strawgate/benchkit/actions/{name}@v1`.

### Action Versioning for Release

Actions should be pinnable at `@v1` (major tag) following GitHub's convention. The release workflow should:

1. Build & test everything
2. Publish `@benchkit/format` and `@benchkit/chart` to npm
3. Create a GitHub release with tag `v{version}`
4. Update the `v1` major tag to point to the latest release

---

## 5. The Missing Critical Feature: PR Comparison

This is the **#1 gap** between benchkit and every competitor. Here's how to build it without adding a server.

### Design: `actions/compare`

A new action that runs **in the PR workflow**, compares the PR's benchmark results against the data branch baseline, and outputs a comparison report:

```
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│ PR benchmark run │     │ actions/compare      │     │ PR Comment / Summary │
│ (stash output)   │────▶│                      │────▶│ + fail-on-regression │
│                  │     │ 1. Read PR result    │     │                      │
└──────────────────┘     │ 2. Fetch baseline    │     └──────────────────────┘
                         │    from data branch  │
                         │ 3. Compute deltas    │
                         │ 4. Apply thresholds  │
                         │ 5. Format output     │
                         └─────────────────────┘
```

#### Inputs

```yaml
inputs:
  results:
    description: 'Path to benchmark result file (from stash parse, or raw file)'
    required: true
  format:
    description: 'Input format (auto|go|benchmark-action|native)'
    default: 'auto'
  data-branch:
    description: 'Branch containing baseline data'
    default: 'bench-data'
  threshold:
    description: 'Regression threshold percentage'
    default: '10'
  threshold-test:
    description: 'Statistical test (percentage|z-score|t-test)'
    default: 'percentage'
  window:
    description: 'Number of recent runs to average for baseline'
    default: '5'
  fail-on-regression:
    description: 'Fail the workflow if regression detected'
    default: 'false'
  comment:
    description: 'Post comparison as PR comment'
    default: 'true'
  github-token:
    description: 'Token for PR comments'
    default: '${{ github.token }}'
```

#### Outputs

```yaml
outputs:
  has-regression:
    description: 'Whether any metric regressed beyond threshold'
  summary:
    description: 'Markdown summary of comparison'
  regressions:
    description: 'JSON array of regressed metrics'
```

#### PR Comment Format (inspired by Bencher + CodSpeed)

```markdown
## ⚡ Benchkit Performance Report

**Comparing:** `abc1234` (this PR) vs `def5678` (baseline: 5-run rolling mean)

| Benchmark | Metric | Baseline | Current | Change | Status |
|-----------|--------|----------|---------|--------|--------|
| BenchmarkSort | ns/op | 320.0 | 328.5 | +2.7% | ✅ |
| BenchmarkSort | allocs/op | 12.0 | 18.0 | +50.0% | 🚨 |
| BenchmarkParse | ns/op | 1420.0 | 1380.0 | -2.8% | ✅ |

### 🔴 1 regression detected (threshold: ±10%)

<details>
<summary>Runner metrics</summary>

| Process | Peak RSS (KB) | CPU User (ms) | Wall Clock (ms) |
|---------|--------------|---------------|-----------------|
| go | 245,312 | 8,420 | 12,350 |
| _system | — | 15.2% user | 512 MB min avail |

</details>

> Results from [benchkit](https://github.com/strawgate/benchkit) · [Full dashboard](https://...)
```

#### Implementation Plan

1. **Move comparison logic to `@benchkit/format`** — add `compare(current: BenchmarkResult, baseline: BenchmarkResult[], options): ComparisonResult` so it's reusable in both the action and chart package
2. **Add statistical tests** — start with `percentage` (current), add `z-score` and `t-test` as options (Bencher validated these are the most useful)
3. **New `actions/compare`** — reads PR result, fetches series from data branch, computes comparison, posts PR comment via GitHub API, writes job summary
4. **Stash action enhancement** — add `save-data-file: false` mode (like benchmark-action) so PR runs don't pollute main data

### Workflow Pattern

```yaml
# On push to main — store results
on:
  push:
    branches: [main]
jobs:
  bench:
    steps:
      - run: go test -bench=. | tee bench.txt
      - uses: strawgate/benchkit/actions/stash@v1
        with: { results: bench.txt }
      - uses: strawgate/benchkit/actions/aggregate@v1

# On PR — compare against baseline
on:
  pull_request:
jobs:
  bench:
    steps:
      - run: go test -bench=. | tee bench.txt
      - uses: strawgate/benchkit/actions/compare@v1
        with:
          results: bench.txt
          fail-on-regression: true
          threshold: 10
```

---

## 6. Feature Roadmap to v1.0

### Wave 0: Release Infrastructure (now)
- [x] Release workflow (tag → npm publish + GitHub release)
- [x] RELEASING.md documentation
- [ ] **Major version tag action (`v1` tag management in release workflow)**
- [x] **npm provenance verification**

### Wave 1: PR-Native Workflow (high priority)
- [ ] **`actions/compare`** — the missing killer feature
- [ ] **Job Summary support in stash** — write `$GITHUB_STEP_SUMMARY` with parsed results
- [ ] **`save-data-file: false` mode for stash** — PR runs that don't commit to data branch
- [ ] **Comparison logic in `@benchkit/format`** — `compare()` function with threshold tests

### Wave 2: Regression Detection (high priority)
- [ ] **Statistical threshold tests** — `percentage` (done), `z-score`, `t-test`
- [ ] **`fail-on-regression` in compare action** — exit code 1 when threshold exceeded
- [ ] **Configurable direction awareness** — `bigger_is_better` vs `smaller_is_better` in threshold logic

### Wave 3: Format Expansion (medium priority)
- [ ] **Rust (`cargo bench`) parser** — large potential user base
- [ ] **Hyperfine parser** — popular CLI benchmarking tool, simple JSON output
- [ ] **pytest-benchmark parser** — Python ecosystem coverage
- [ ] **Custom `smaller_is_better` / `bigger_is_better` JSON** — benchmark-action compat for direction
- [ ] **`@benchkit/format` plugin system** — allow users to register custom parsers

### Wave 4: Dashboard Polish (medium priority)
- [ ] Scenario matrix view for evolution pattern (tag dimensions as rows/columns)
- [ ] Dashboard split: separate state hook from render components
- [ ] Export/embed support (static PNG/SVG for README badges)
- [ ] Configurable date range / zoom on trend charts

### Wave 5: Ecosystem Integration (lower priority)
- [ ] **GitHub App** for automatic PR comments (vs. workflow-level token)
- [ ] **Composite action** that combines stash + aggregate in one step for simple cases
- [ ] GitLab CI support (same format package, different action wrapper)
- [ ] Badge generation action (`/badge/metric/value.svg`)

---

## 7. Data Schema Evolution Strategy

The current schema is well-designed for v1. Key additions needed:

### `ComparisonResult` (new type in `@benchkit/format`)

```typescript
interface ComparisonResult {
  /** Current run being compared */
  current: BenchmarkResult;
  /** Baseline derived from N most recent runs */
  baseline: {
    window: number;
    runIds: string[];
    startDate: string;
    endDate: string;
  };
  /** Per-benchmark, per-metric comparisons */
  comparisons: ComparisonEntry[];
  /** Overall verdict */
  hasRegression: boolean;
  thresholdConfig: ThresholdConfig;
}

interface ComparisonEntry {
  benchmark: string;
  metric: string;
  unit?: string;
  direction: 'bigger_is_better' | 'smaller_is_better';
  baselineValue: number;
  currentValue: number;
  percentChange: number;
  /** Regression status based on configured threshold */
  status: 'improved' | 'stable' | 'regressed';
  /** Confidence (if statistical test used) */
  confidence?: number;
}

interface ThresholdConfig {
  test: 'percentage' | 'z-score' | 't-test';
  percentage?: number;       // for percentage test
  confidence?: number;       // for z-score / t-test
  window: number;            // number of runs to average
  minSampleSize?: number;    // minimum data points required
}
```

### Backward Compatibility

- All new fields are **additive and optional**
- Existing `BenchmarkResult`, `SeriesFile`, `IndexFile` types unchanged
- Schema files get new `comparison-result.schema.json` (no modifications to existing schemas)
- Compare action output is a new file format, not a modification of existing ones

---

## 8. Key Design Decisions

### Why `actions/compare` vs. enhancing `actions/stash`

- **Separation of concerns:** stash = write data, compare = analyze data
- **PR safety:** compare never writes to the data branch
- **Reusability:** compare can work with any `BenchmarkResult`, not just stash output
- **Permissions:** compare needs `pull-requests: write` for comments; stash needs `contents: write` for data branch. Different permission profiles.

### Why percentage threshold as the default (not t-test)

- Bencher's docs note t-test needs ≥30 data points to be reliable
- Most users start with 0 history — percentage works from run #2
- Statistical tests are available as opt-in for mature projects
- This matches benchmark-action's approach (200% default threshold)

### Why not a SaaS/server model

- Benchkit's differentiator is zero-infrastructure
- Git branch + CDN is as durable as the repo itself
- No vendor lock-in, no privacy concerns, works with air-gapped repos
- The competitive advantage against Bencher/CodSpeed is simplicity

---

## 9. Immediate Next Steps (Priority Order)

1. **Ship v0.1.0 release** — npm publish `@benchkit/format` + `@benchkit/chart`, create `v0.1.0` tag, set up `v0` major tag
2. **Build `actions/compare`** — this is the feature that makes benchkit useful in real CI workflows
3. **Add job summary to stash** — quick win, writes parsed results to `$GITHUB_STEP_SUMMARY`
4. **Add Rust parser** — Go + Rust covers the two biggest benchmarking communities
5. **Write integration example** — full workflow in `benchkit-demo` showing PR comparison + main tracking
6. **Publish to GitHub Marketplace** — make the actions discoverable

---

## 10. Success Metrics for v1.0

- Actions work end-to-end: stash → aggregate → compare → PR comment
- Dashboard renders correctly from pre-aggregated data
- At least 4 input format parsers (Go, Rust, benchmark-action, native)
- Regression detection prevents merging bad PRs in demo repo
- README and docs are clear enough for first-time setup in < 10 minutes
- All schemas are versioned and documented
