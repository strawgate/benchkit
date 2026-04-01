# Benchkit Plans

## Resolved Decisions

| Decision | Resolution | Rationale |
|----------|-----------|-----------|
| Monitor language | TypeScript (not Go) | Same toolchain, same `npm run build`, same `@vercel/ncc` bundling, shares types from `@benchkit/format`, no binary distribution question |
| macOS/Windows runners | Warn and no-op | Graceful degradation; user's workflow still passes, they just don't get monitor data |
| Schema change for stash merge | Same PR, additive optional fields | Adding optional `monitor` sub-key to `Context` is backward-compatible |
| Polling interval cap | Not needed | Output stores per-process aggregates (peak RSS, total CPU), not raw time-series snapshots |
| Dashboard `_monitor/` section | Visual section within existing overview | Not a new view mode — just a divider and grouped section below user benchmarks |
| `_bench/` precision window | Document it, don't worry about it | Extra series files are small and the feature is opt-in |
| Statistical thresholds (z-score, t-test) | Declined | Percentage thresholds are sufficient; statistical tests add complexity with marginal benefit given CI data constraints. |

---

## Two Dashboard Usage Patterns

### Pattern 1: Competitive / Head-to-Head

*"I benchmark N different implementations and track which one wins over time."*

- Example: Sort algorithms (quicksort vs mergesort vs timsort) all benchmarked on every commit
- All implementations run in the same CI job, same input data
- Dashboard emphasis: **side-by-side comparison** — bar charts, relative %, "who's winning?"
- Key question: "Which approach is fastest, and has that changed?"
- Data shape: Multiple benchmarks with the same metric (e.g., `ns/op`) but different names
- `ComparisonBar` is the primary component; trend charts are secondary

### Pattern 2: Evolution / Multi-Scenario

*"I benchmark my code across different scenarios and track how performance evolves."*

- Example: Same function benchmarked on {linux, macos} × {small, medium, large input}
- Dashboard emphasis: **trend lines** — sparklines over time, regression detection
- Key question: "Are we getting faster or slower? Where did we regress?"
- Data shape: Tags differentiate scenarios (`{os: "linux", size: "large"}`)
- `TrendChart` is the primary component; comparison bars are secondary

### Component Needs

| Need | Competitive | Evolution | Current Support |
|------|------------|-----------|-----------------|
| Side-by-side bars for latest run | Primary view | Secondary | `ComparisonBar` exists |
| Trend sparklines over time | Secondary | Primary view | `TrendChart` exists |
| Group by benchmark name | Already natural | Need tag grouping | Not built |
| Filter/facet by tags | Nice-to-have | Essential | Not built |
| "Winner" indicator | Key feature | Not needed | Not built |
| Regression detection | Nice-to-have | Key feature | Not built |
| Scenario matrix view | — | Ideal | Not built |

### Example Strategy

Both patterns should be demonstrated in the `benchkit-demo` repo:
1. **Competitive example**: Benchmark 3 sort algorithms in Go, show leaderboard + trends
2. **Evolution example**: Benchmark one function across OS/size combos, show trends + regression

---

## Monitor Action Design (TypeScript Implementation)

### Architecture

The monitor runs as a background Node.js process alongside the user's workflow steps. It polls `/proc` at a configurable interval, tracks every process that starts and stops during the monitoring window, and emits benchkit-native JSON when stopped.

### Workflow Usage

```yaml
jobs:
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start monitor
        uses: strawgate/benchkit/actions/monitor@main
        with:
          mode: start
          poll-interval: 250    # ms, default: 250
          output: monitor.json

      - name: Run Go benchmarks
        run: go test -bench=. -benchmem -count=3 ./... | tee bench.txt

      - name: Stop monitor
        uses: strawgate/benchkit/actions/monitor@main
        with:
          mode: stop

      - name: Stash results
        uses: strawgate/benchkit/actions/stash@main
        with:
          results: bench.txt
          monitor: monitor.json
          format: go
```

### Implementation Structure

```
actions/monitor/
  action.yml          # mode, poll-interval, output, ignore-commands inputs
  package.json
  tsconfig.json
  src/
    main.ts           # Action entry: start forks background, stop touches sentinel
    monitor.ts        # Background process: poll loop, process tracking, output
    proc.ts           # /proc parsing: status, stat, io, comm, cmdline
    types.ts          # ProcessSnapshot, MonitorOutput types
```

### Process Tracking

- On start: take baseline PID snapshot, fork monitor process to background
- Poll loop: scan `/proc/` for new PIDs, update known PIDs, detect exits
- On stop: sentinel file at `$RUNNER_TEMP/.benchkit-monitor.stop` triggers final scan + output
- Signal mechanism: sentinel file (not signals) for cross-step compatibility

### Per-Process Metrics

| Metric | Source | Unit | Direction |
|--------|--------|------|-----------|
| `peak_rss_kb` | `/proc/[pid]/status` → `VmHWM` | KB | smaller_is_better |
| `final_rss_kb` | `/proc/[pid]/status` → `VmRSS` | KB | smaller_is_better |
| `cpu_user_ms` | `/proc/[pid]/stat` field 14 | ms | smaller_is_better |
| `cpu_system_ms` | `/proc/[pid]/stat` field 15 | ms | smaller_is_better |
| `wall_clock_ms` | first_seen to last_seen | ms | smaller_is_better |
| `io_read_bytes` | `/proc/[pid]/io` | bytes | — |
| `io_write_bytes` | `/proc/[pid]/io` | bytes | — |
| `voluntary_ctx_switches` | `/proc/[pid]/status` | count | smaller_is_better |
| `involuntary_ctx_switches` | `/proc/[pid]/status` | count | smaller_is_better |

### System-Wide Metrics

| Metric | Source | Unit |
|--------|--------|------|
| `cpu_user_pct` | `/proc/stat` delta | % |
| `cpu_system_pct` | `/proc/stat` delta | % |
| `mem_available_min_mb` | `/proc/meminfo` | MB |
| `load_avg_1m_max` | `/proc/loadavg` | load |

### Output Format

Standard benchkit-native JSON with `_monitor/` prefix:
- `_monitor/process/{short_name}` — per-process metrics
- `_monitor/system` — system-wide metrics
- `_bench/process/{short_name}` — precision window (if markers used)

### Filtering

- Minimum lifetime filter: processes < 2 poll intervals are dropped
- `ignore-commands` input for explicit filtering
- Baseline PID snapshot excludes pre-existing processes

### Platform Support

- Linux: full `/proc` support
- macOS/Windows: warn and no-op (runner still works, no monitor data)

---

## Stash Integration

Add optional `monitor` input to `actions/stash`:
- Read and validate monitor JSON as `BenchmarkResult`
- Concatenate `benchmarks` arrays
- Merge `context` (monitor context in `monitor` sub-key)

### Type Changes

Add to `Context` in `@benchkit/format`:
```ts
interface Context {
  // existing fields...
  monitor?: {
    monitor_version: string;
    poll_interval_ms: number;
    duration_ms: number;
    runner_os: string;
    runner_arch: string;
    kernel?: string;
    cpu_model?: string;
    cpu_count?: number;
    total_memory_mb?: number;
  };
}
```

---

## Roadmap (Issue Tracker)

| Wave | Milestone | Issues | Status |
|------|-----------|--------|--------|
| 1 | Core Infrastructure | #16 Monitor action, #3 Chart test coverage | Copilot working (PR #19) |
| 2 | Chart Hardening | #22 Date adapter fix, #20 fetch baseUrl+AbortSignal, #21 DashboardProps | Copilot assigned |
| 3 | Integration | #17 Stash ← monitor merge | Blocked on Wave 1 |
| 4 | Dashboard Patterns | #18 (parent) → #23 monitor section, #24 tag filtering, #25 leaderboard, #26 regression detection | Blocked on Wave 2 |
| 5 | Polish & Examples | #7 Integration examples | Blocked on Wave 3–4 |

### Dependency Graph

```
Wave 1: #16 monitor ──┬──► Wave 3: #17 stash integration ──► Wave 5: #7 examples
        #3 chart tests │
                       │
Wave 2: #22 date adapter ─┬──► Wave 4: #23 monitor section
        #20 fetch layer ──┤              #24 tag filtering
        #21 DashboardProps┘              #25 leaderboard
                                         #26 regression detection
```

### Phase 3: Evolution Pattern Support
- Tag-based grouping and filtering
- Scenario matrix view (benchmark × tags grid)
- Regression detection (threshold-based, configurable)

### Phase 4: Precision Windows
- Support `_bench/` prefix alongside `_monitor/`
- Separate section or toggle for precision-windowed metrics

---

## Optional: Marker Files for Precision Windows

Users can bracket their actual benchmark with marker files:
```bash
touch $RUNNER_TEMP/.benchkit-mark-start
# ... run benchmarks ...
touch $RUNNER_TEMP/.benchkit-mark-end
```

Monitor resets baseline on start marker, freezes `_bench/` metrics on end marker.
`_monitor/` metrics still cover the full start-to-stop window.
