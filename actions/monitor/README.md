# Benchkit Monitor

Background system and custom metrics collection via [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/). Runs `otelcol-contrib` as a detached background process alongside your workflow steps, capturing host metrics and accepting custom OTLP telemetry. Raw OTLP JSONL is pushed to the data branch on completion.

**Cross-platform.** Works on Linux, macOS, and Windows runners.

## Usage

```yaml
jobs:
  bench:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start monitor
        uses: strawgate/benchkit/actions/monitor@main
        id: monitor

      - name: Run benchmarks
        run: go test -bench=. -benchmem -count=3 ./... | tee bench.txt

      # Monitor stops automatically via post step — no explicit stop needed.

      - name: Stash results
        uses: strawgate/benchkit/actions/stash@main
        with:
          results: bench.txt
          format: go
```

The action uses a `post` entry point, so the collector is automatically stopped and telemetry is pushed when the job completes. No `mode: start/stop` needed.

### Sending custom metrics

The OTLP receivers are enabled by default. Your benchmarks can send custom metrics to the collector:

```yaml
      - name: Run benchmarks
        run: ./my-benchmark --otlp-endpoint=${{ steps.monitor.outputs.otlp-grpc-endpoint }}
```

## Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `collector-version` | `0.102.0` | OTel Collector Contrib version to download. See [releases](https://github.com/open-telemetry/opentelemetry-collector-releases/releases). |
| `scrape-interval` | `1s` | Host metrics scrape interval (e.g. `1s`, `250ms`, `5m`). |
| `metric-sets` | `cpu,memory,load,process` | Comma-separated host metric scrapers: `cpu`, `memory`, `disk`, `network`, `process`, `load`, `filesystem`, `paging`. |
| `otlp-grpc-port` | `4317` | OTLP gRPC receiver port. Set to `0` to disable. |
| `otlp-http-port` | `4318` | OTLP HTTP receiver port. Set to `0` to disable. |
| `data-branch` | `bench-data` | Branch to push telemetry data to. |
| `run-id` | _(auto)_ | Run identifier. Defaults to `$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT`. |
| `github-token` | `${{ github.token }}` | Token for pushing to the data branch. |

## Outputs

| Output | Description |
|--------|-------------|
| `otlp-grpc-endpoint` | OTLP gRPC endpoint (e.g. `localhost:4317`). |
| `otlp-http-endpoint` | OTLP HTTP endpoint (e.g. `http://localhost:4318`). |

## Output format

Raw OTLP JSONL is pushed to `<data-branch>/data/telemetry/<run-id>.otlp.jsonl`. Each line is a JSON object with `resourceMetrics[]` containing `scopeMetrics[]` with metric data points.

Resource attributes include benchkit semantic conventions:
- `benchkit.run_id` — run identifier
- `benchkit.kind` — `hybrid`
- `benchkit.source_format` — `otlp`
- `benchkit.ref` — git ref (when available)
- `benchkit.commit` — commit SHA (when available)

## How it works

1. **Start** (main step): downloads `otelcol-contrib`, generates collector config, spawns it as a detached process, records state
2. **Collect**: hostmetrics receiver scrapes system/process metrics at the configured interval; OTLP receivers accept custom metrics from benchmarks
3. **Stop** (post step): sends SIGTERM, waits for graceful flush, dumps collector logs for diagnostics, filters process metrics to runner descendants, pushes OTLP JSONL to data branch
4. **Process filtering**: records the runner worker PID at start; in post-processing, builds a process tree from OTLP `process.pid`/`process.parent_pid` attributes and keeps only runner descendants

## Architecture

```
main.ts          → Action entry (start collector)
post.ts          → Post-step entry (stop, filter, push)
otel-config.ts   → Collector YAML config generation
otel-start.ts    → Download, cache, spawn collector
otel-stop.ts     → Stop collector, filter processes, push telemetry
types.ts         → OtelState interface
```
