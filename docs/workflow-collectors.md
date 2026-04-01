# Workflow Benchmark Collectors

Benchkit ships two collection paths so you can turn arbitrary HTTP responses and Prometheus scrapes into native benchmark metrics — without writing boilerplate collection code.

Both paths emit a `BenchmarkResult` JSON file in the [native benchkit format](../schema/benchmark-result.schema.json) that the `actions/stash` action accepts via its `monitor` input (or directly as `results`).

---

## Table of contents

- [JSON collector](#json-collector)
  - [Inputs](#json-inputs)
  - [Metric mapping format](#json-metric-mapping-format)
  - [Examples](#json-examples)
- [Prometheus collector](#prometheus-collector)
  - [Inputs](#prometheus-inputs)
  - [Metric request format](#prometheus-metric-request-format)
  - [Examples](#prometheus-examples)
- [Composing with stash and monitor](#composing-with-stash-and-monitor)

---

## JSON collector

Use `mode: json` to read metrics from a JSON HTTP endpoint or a local file.

### JSON inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `mode` | ✅ | — | `json` |
| `url` | ⚠️ | — | JSON endpoint to GET |
| `file` | ⚠️ | — | Local JSON file path (alternative to `url`) |
| `metrics` | ✅ | — | JSON array of field mappings (see below) |
| `benchmark-name` | | `workflow` | Name for the benchmark in the output |
| `tags` | | `{}` | JSON object of tags to attach (`{"env":"prod"}`) |
| `output` | | `collect.json` | Output file path |

Either `url` or `file` must be supplied.

### JSON metric mapping format

The `metrics` input is a JSON array. Each element maps one JSON field to a benchkit metric:

```json
[
  {
    "field": "events_per_sec",
    "name": "events_per_sec",
    "unit": "count/s",
    "direction": "bigger_is_better"
  },
  {
    "field": "system.rss_mb",
    "name": "rss_mb",
    "unit": "MB",
    "direction": "smaller_is_better"
  }
]
```

| Property | Required | Description |
|----------|----------|-------------|
| `field` | ✅ | JSON field path. Supports dot-notation for nested fields (`"system.rss_mb"`). |
| `name` | ✅ | Metric key in the benchkit output. |
| `unit` | | Human-readable unit label (e.g. `"ns/op"`, `"MB"`, `"count/s"`). |
| `direction` | | `"bigger_is_better"` or `"smaller_is_better"`. Drives regression detection. |

### JSON examples

#### Fetch from an HTTP endpoint

```yaml
- name: Collect app stats
  uses: strawgate/benchkit/actions/collect@main
  with:
    mode: json
    url: http://localhost:8080/stats
    benchmark-name: http-server
    metrics: |
      [
        {"field":"events_per_sec","name":"events_per_sec","unit":"count/s","direction":"bigger_is_better"},
        {"field":"rss_mb",        "name":"rss_mb",        "unit":"MB",      "direction":"smaller_is_better"}
      ]
    output: app-stats.json
```

#### Read from a local file

```yaml
- name: Collect from local report
  uses: strawgate/benchkit/actions/collect@main
  with:
    mode: json
    file: reports/perf.json
    benchmark-name: perf-report
    metrics: |
      [
        {"field":"p99_latency_ms","name":"p99_latency_ms","unit":"ms","direction":"smaller_is_better"},
        {"field":"throughput",    "name":"throughput",    "unit":"req/s","direction":"bigger_is_better"}
      ]
```

#### With tags for scenario tracking

```yaml
- name: Collect Linux results
  uses: strawgate/benchkit/actions/collect@main
  with:
    mode: json
    url: http://localhost:9000/metrics.json
    benchmark-name: server
    tags: '{"os":"linux","arch":"amd64"}'
    metrics: '[{"field":"qps","name":"qps","unit":"req/s","direction":"bigger_is_better"}]'
```

#### Local use (Node.js script)

You can also use the collection logic directly from `@benchkit/format` compatible code:

```bash
node -e "
const data = JSON.parse(require('fs').readFileSync('report.json', 'utf-8'));
const result = {
  benchmarks: [{
    name: 'my-service',
    metrics: {
      events_per_sec: { value: data.events_per_sec, unit: 'count/s', direction: 'bigger_is_better' },
      rss_mb:         { value: data.rss_mb,         unit: 'MB',      direction: 'smaller_is_better' }
    }
  }],
  context: { timestamp: new Date().toISOString() }
};
require('fs').writeFileSync('collect.json', JSON.stringify(result, null, 2));
"
```

---

## Prometheus collector

Use `mode: prometheus` to scrape a Prometheus `/metrics` endpoint (text exposition format) and map named metrics to benchkit metrics.

### Prometheus inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `mode` | ✅ | — | `prometheus` |
| `url` | ✅ | — | Prometheus `/metrics` endpoint URL |
| `metrics` | ✅ | — | JSON array of metric requests (see below) |
| `label-filter` | | `{}` | Global label filter applied to every metric |
| `benchmark-name` | | `workflow` | Name for the benchmark in the output |
| `tags` | | `{}` | JSON object of tags to attach (`{"env":"prod"}`) |
| `output` | | `collect.json` | Output file path |

### Prometheus metric request format

```json
[
  {
    "metric": "http_requests_total",
    "name": "http_requests",
    "unit": "requests",
    "direction": "bigger_is_better"
  },
  {
    "metric": "process_resident_memory_bytes",
    "name": "rss_bytes",
    "unit": "bytes",
    "direction": "smaller_is_better",
    "labels": {"job": "api"}
  }
]
```

| Property | Required | Description |
|----------|----------|-------------|
| `metric` | ✅ | Exact Prometheus metric name to look up. |
| `name` | ✅ | Metric key in the benchkit output. |
| `unit` | | Human-readable unit label. |
| `direction` | | `"bigger_is_better"` or `"smaller_is_better"`. |
| `labels` | | Per-metric label filter (merged with global `label-filter`). When multiple entries match after filtering, their values are **summed**. |

### Prometheus examples

#### Scrape a local /metrics endpoint

```yaml
- name: Collect Prometheus metrics
  uses: strawgate/benchkit/actions/collect@main
  with:
    mode: prometheus
    url: http://localhost:9090/metrics
    benchmark-name: app-server
    metrics: |
      [
        {"metric":"http_requests_total",          "name":"http_requests","unit":"requests","direction":"bigger_is_better"},
        {"metric":"process_resident_memory_bytes","name":"rss_bytes",    "unit":"bytes",   "direction":"smaller_is_better"}
      ]
    output: prom-metrics.json
```

#### Filter by labels globally

```yaml
- name: Collect metrics for a specific job
  uses: strawgate/benchkit/actions/collect@main
  with:
    mode: prometheus
    url: http://localhost:9090/metrics
    benchmark-name: api-server
    label-filter: '{"job":"api","instance":"localhost:8080"}'
    metrics: |
      [
        {"metric":"http_requests_total","name":"requests","unit":"requests","direction":"bigger_is_better"},
        {"metric":"http_request_duration_seconds_sum","name":"duration_sum","unit":"s"}
      ]
```

#### Mix of global and per-metric filters

```yaml
- name: Collect with mixed filters
  uses: strawgate/benchkit/actions/collect@main
  with:
    mode: prometheus
    url: http://localhost:9090/metrics
    benchmark-name: api
    label-filter: '{"job":"api"}'
    metrics: |
      [
        {"metric":"http_requests_total","name":"http_2xx","unit":"requests","labels":{"code":"200"}},
        {"metric":"http_requests_total","name":"http_5xx","unit":"requests","labels":{"code":"500"}}
      ]
```

#### Local use (curl + node)

```bash
# Scrape metrics endpoint
curl -s http://localhost:9090/metrics > /tmp/prom.txt

# Parse and convert (using benchkit collect action's output format directly)
node -e "
const text = require('fs').readFileSync('/tmp/prom.txt', 'utf-8');
const lines = text.split('\n').filter(l => !l.startsWith('#') && l.trim());
function getValue(name) {
  const line = lines.find(l => l.startsWith(name + ' ') || l.startsWith(name + '{'));
  if (!line) throw new Error('metric not found: ' + name);
  return parseFloat(line.split(/\s+/).slice(-1)[0]);
}
const result = {
  benchmarks: [{
    name: 'app-server',
    metrics: {
      http_requests: { value: getValue('http_requests_total'), unit: 'requests', direction: 'bigger_is_better' },
      rss_bytes:     { value: getValue('process_resident_memory_bytes'), unit: 'bytes', direction: 'smaller_is_better' }
    }
  }],
  context: { timestamp: new Date().toISOString() }
};
require('fs').writeFileSync('prom-metrics.json', JSON.stringify(result, null, 2));
"
```

---

## Composing with stash and monitor

Collected metrics are native benchkit JSON and can be passed directly to `actions/stash` as the `results` input (using `format: native`), or combined with monitor data using the `monitor` input.

### JSON metrics + stash

```yaml
- name: Collect app stats
  uses: strawgate/benchkit/actions/collect@main
  with:
    mode: json
    url: http://localhost:8080/stats
    benchmark-name: app
    metrics: '[{"field":"rps","name":"rps","unit":"req/s","direction":"bigger_is_better"}]'
    output: app-stats.json

- name: Stash results
  uses: strawgate/benchkit/actions/stash@main
  with:
    results: app-stats.json
    format: native
```

### Prometheus metrics + system monitor + stash

```yaml
- name: Start monitor
  uses: strawgate/benchkit/actions/monitor@main
  with:
    mode: start
    output: monitor.json

- name: Run load test
  run: ./run-load-test.sh

- name: Stop monitor
  uses: strawgate/benchkit/actions/monitor@main
  with:
    mode: stop

- name: Collect Prometheus metrics
  uses: strawgate/benchkit/actions/collect@main
  with:
    mode: prometheus
    url: http://localhost:9090/metrics
    benchmark-name: load-test
    metrics: |
      [
        {"metric":"http_requests_total",          "name":"requests",  "unit":"requests","direction":"bigger_is_better"},
        {"metric":"process_resident_memory_bytes","name":"rss_bytes", "unit":"bytes",   "direction":"smaller_is_better"}
      ]
    output: prom-metrics.json

- name: Stash all results
  uses: strawgate/benchkit/actions/stash@main
  with:
    results: prom-metrics.json
    format: native
    monitor: monitor.json   # attach system metrics from monitor action
```

### Complete workflow example

```yaml
name: Load test benchmarks
on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start your service
        run: ./start-server.sh &

      - name: Start monitor
        uses: strawgate/benchkit/actions/monitor@main
        with:
          mode: start
          output: monitor.json

      - name: Run load test
        run: sleep 30  # let the service warm up and gather metrics

      - name: Stop monitor
        uses: strawgate/benchkit/actions/monitor@main
        with:
          mode: stop

      - name: Collect Prometheus metrics
        uses: strawgate/benchkit/actions/collect@main
        with:
          mode: prometheus
          url: http://localhost:8080/metrics
          benchmark-name: http-server
          tags: '{"scenario":"load-test"}'
          metrics: |
            [
              {"metric":"http_requests_total",          "name":"requests",  "unit":"requests","direction":"bigger_is_better"},
              {"metric":"process_resident_memory_bytes","name":"rss_bytes", "unit":"bytes",   "direction":"smaller_is_better"},
              {"metric":"go_goroutines",                "name":"goroutines","unit":"count"}
            ]
          output: prom-metrics.json

      - name: Stash results
        uses: strawgate/benchkit/actions/stash@main
        with:
          results: prom-metrics.json
          format: native
          monitor: monitor.json

      - name: Aggregate
        uses: strawgate/benchkit/actions/aggregate@main
```
