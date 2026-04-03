import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detailViewToBenchmarkResult } from "./run-detail-converter.js";
import type { RunDetailView } from "./types.js";

describe("detailViewToBenchmarkResult", () => {
  it("converts a simple RunDetailView to BenchmarkResult", () => {
    const detail: RunDetailView = {
      run: {
        id: "run-1",
        timestamp: "2026-04-01T00:00:00Z",
        commit: "abc123",
        ref: "refs/heads/main",
      },
      metricSnapshots: [
        {
          metric: "ns_per_op",
          unit: "ns/op",
          direction: "smaller_is_better",
          values: [
            {
              name: "BenchmarkSort",
              value: 320,
              unit: "ns/op",
              direction: "smaller_is_better",
            },
          ],
        },
      ],
    };

    const result = detailViewToBenchmarkResult(detail);

    assert.equal(result.benchmarks.length, 1);
    assert.equal(result.benchmarks[0].name, "BenchmarkSort");
    assert.deepEqual(result.benchmarks[0].metrics, {
      ns_per_op: { value: 320, unit: "ns/op", direction: "smaller_is_better", range: undefined },
    });
    assert.equal(result.context?.commit, "abc123");
    assert.equal(result.context?.ref, "refs/heads/main");
    assert.equal(result.context?.timestamp, "2026-04-01T00:00:00Z");
  });

  it("falls back to snapshot-level unit and direction when metric-level values are absent", () => {
    const detail: RunDetailView = {
      run: {
        id: "run-2",
        timestamp: "2026-04-01T00:00:00Z",
      },
      metricSnapshots: [
        {
          metric: "events_per_sec",
          unit: "events/sec",
          direction: "bigger_is_better",
          values: [
            {
              name: "BenchmarkIngest",
              value: 13240.5,
              // no unit/direction at metric level — should inherit from snapshot
            },
          ],
        },
      ],
    };

    const result = detailViewToBenchmarkResult(detail);
    const metric = result.benchmarks[0].metrics["events_per_sec"];

    assert.equal(metric.unit, "events/sec");
    assert.equal(metric.direction, "bigger_is_better");
  });

  it("groups metrics from the same benchmark name+tags into one Benchmark entry", () => {
    const detail: RunDetailView = {
      run: { id: "run-3", timestamp: "2026-04-01T00:00:00Z" },
      metricSnapshots: [
        {
          metric: "ns_per_op",
          unit: "ns/op",
          direction: "smaller_is_better",
          values: [{ name: "BenchmarkA", value: 100, tags: { procs: "1" } }],
        },
        {
          metric: "bytes_per_op",
          unit: "B/op",
          direction: "smaller_is_better",
          values: [{ name: "BenchmarkA", value: 64, tags: { procs: "1" } }],
        },
      ],
    };

    const result = detailViewToBenchmarkResult(detail);

    assert.equal(result.benchmarks.length, 1);
    assert.ok("ns_per_op" in result.benchmarks[0].metrics);
    assert.ok("bytes_per_op" in result.benchmarks[0].metrics);
  });

  it("creates separate Benchmark entries for different tags", () => {
    const detail: RunDetailView = {
      run: { id: "run-4", timestamp: "2026-04-01T00:00:00Z" },
      metricSnapshots: [
        {
          metric: "ns_per_op",
          unit: "ns/op",
          direction: "smaller_is_better",
          values: [
            { name: "BenchmarkA", value: 100, tags: { procs: "1" } },
            { name: "BenchmarkA", value: 50, tags: { procs: "8" } },
          ],
        },
      ],
    };

    const result = detailViewToBenchmarkResult(detail);

    assert.equal(result.benchmarks.length, 2);
  });

  it("preserves range from snapshot metric values", () => {
    const detail: RunDetailView = {
      run: { id: "run-5", timestamp: "2026-04-01T00:00:00Z" },
      metricSnapshots: [
        {
          metric: "ns_per_op",
          unit: "ns/op",
          direction: "smaller_is_better",
          values: [{ name: "BenchmarkA", value: 300, range: 12.5 }],
        },
      ],
    };

    const result = detailViewToBenchmarkResult(detail);
    assert.equal(result.benchmarks[0].metrics["ns_per_op"].range, 12.5);
  });

  it("includes monitor context when present", () => {
    const monitor = {
      monitor_version: "1.0.0",
      poll_interval_ms: 100,
      duration_ms: 5000,
    };
    const detail: RunDetailView = {
      run: { id: "run-6", timestamp: "2026-04-01T00:00:00Z", monitor },
      metricSnapshots: [],
    };

    const result = detailViewToBenchmarkResult(detail);
    assert.deepEqual(result.context?.monitor, monitor);
  });

  it("round-trip: multi-benchmark multi-metric detail view", () => {
    const detail: RunDetailView = {
      run: {
        id: "run-7",
        timestamp: "2026-04-01T00:00:00Z",
        commit: "deadbeef",
        ref: "refs/heads/main",
      },
      metricSnapshots: [
        {
          metric: "events_per_sec",
          unit: "events/sec",
          direction: "bigger_is_better",
          values: [
            { name: "mock-http-ingest [scenario=json-ingest]", value: 13240.5, tags: { scenario: "json-ingest" } },
            { name: "mock-http-ingest [scenario=csv-ingest]", value: 9800, tags: { scenario: "csv-ingest" } },
          ],
        },
        {
          metric: "p95_batch_ms",
          unit: "ms",
          direction: "smaller_is_better",
          values: [
            { name: "mock-http-ingest [scenario=json-ingest]", value: 143.2, tags: { scenario: "json-ingest" } },
            { name: "mock-http-ingest [scenario=csv-ingest]", value: 220.1, tags: { scenario: "csv-ingest" } },
          ],
        },
      ],
    };

    const result = detailViewToBenchmarkResult(detail);

    assert.equal(result.benchmarks.length, 2);
    assert.equal(result.context?.commit, "deadbeef");
    assert.equal(result.context?.ref, "refs/heads/main");

    const jsonBench = result.benchmarks.find((b) => b.tags?.["scenario"] === "json-ingest");
    assert.ok(jsonBench);
    assert.equal(jsonBench.metrics["events_per_sec"].value, 13240.5);
    assert.equal(jsonBench.metrics["p95_batch_ms"].value, 143.2);

    const csvBench = result.benchmarks.find((b) => b.tags?.["scenario"] === "csv-ingest");
    assert.ok(csvBench);
    assert.equal(csvBench.metrics["events_per_sec"].value, 9800);
    assert.equal(csvBench.metrics["p95_batch_ms"].value, 220.1);
  });

  it("groups metrics with same tags regardless of property order", () => {
    const detail: RunDetailView = {
      run: { id: "run-8", timestamp: "2026-04-01T00:00:00Z" },
      metricSnapshots: [
        {
          metric: "ns_per_op",
          unit: "ns/op",
          direction: "smaller_is_better",
          values: [{ name: "BenchmarkA", value: 100, tags: { procs: "1", env: "ci" } }],
        },
        {
          metric: "bytes_per_op",
          unit: "B/op",
          direction: "smaller_is_better",
          values: [{ name: "BenchmarkA", value: 64, tags: { env: "ci", procs: "1" } }],
        },
      ],
    };

    const result = detailViewToBenchmarkResult(detail);

    assert.equal(result.benchmarks.length, 1);
    assert.ok("ns_per_op" in result.benchmarks[0].metrics);
    assert.ok("bytes_per_op" in result.benchmarks[0].metrics);
  });
});
