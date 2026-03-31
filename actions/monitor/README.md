# Benchkit Monitor

Background system metrics collection via `/proc` polling. Runs as a detached Node.js process alongside your workflow steps, capturing per-process and system-wide metrics without wrapping your benchmark command.

**Linux only.** On macOS/Windows runners the action emits a warning and no-ops — your workflow still passes.

## Usage

```yaml
jobs:
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start monitor
        uses: strawgate/benchkit/actions/monitor@v1
        with:
          mode: start
          poll-interval: 250    # ms (default)
          output: monitor.json

      - name: Run benchmarks
        run: go test -bench=. -benchmem -count=3 ./... | tee bench.txt

      - name: Stop monitor
        uses: strawgate/benchkit/actions/monitor@v1
        with:
          mode: stop

      - name: Stash results
        uses: strawgate/benchkit/actions/stash@v1
        with:
          results: bench.txt
          monitor: monitor.json   # future: stash integration
          format: go
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `mode` | yes | — | `start` or `stop` |
| `poll-interval` | no | `250` | Poll interval in ms (50–60000) |
| `output` | no | `monitor.json` | Path for the output JSON file |
| `ignore-commands` | no | `""` | Comma-separated substrings to filter out (e.g. `git,sh`) |

## Outputs

| Output | Description |
|--------|-------------|
| `output-file` | Path to the monitor JSON (set on `stop`) |

## Output format

Standard benchkit-native JSON with `_monitor/` prefix:

- **`_monitor/process/{name}`** — per-process metrics: `peak_rss_kb`, `cpu_user_ms`, `cpu_system_ms`, `wall_clock_ms`, `io_read_bytes`, `io_write_bytes`, `voluntary_ctx_switches`, `involuntary_ctx_switches`
- **`_monitor/system`** — system-wide: `cpu_user_pct`, `cpu_system_pct`, `mem_available_min_mb`, `load_avg_1m_max`

## How it works

1. **Start**: forks a detached background worker, takes a baseline PID snapshot, writes state to `$RUNNER_TEMP`
2. **Poll loop**: scans `/proc` for new processes, tracks CPU/memory/IO deltas, records system metrics
3. **Stop**: writes a sentinel file, worker detects it and writes final JSON output
4. **Filtering**: processes seen fewer than 2 polls are dropped; `ignore-commands` filters by substring match on `comm` and `cmdline`

## Architecture

```
main.ts            → Action entry (start/stop)
monitor-worker.ts  → Background poll loop (forked)
monitor.ts         → Pure functions: filtering, grouping, output generation
proc.ts            → /proc parsers (stat, status, io, meminfo, loadavg)
types.ts           → Shared interfaces
```
