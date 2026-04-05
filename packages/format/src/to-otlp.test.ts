import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { benchmarkResultToOtlp } from "./to-otlp.js";
import { otlpAttributesToRecord } from "./parse-otlp.js";
import type { BenchmarkResult } from "./types.js";

describe("benchmarkResultToOtlp", () => {
  const baseResult: BenchmarkResult = {
    benchmarks: [
      {
        name: "BenchmarkSort",
        metrics: {
          ns_per_op: { value: 320, unit: "ns/op", direction: "smaller_is_better" },
          bytes_per_op: { value: 48, unit: "B/op" },
        },
      },
    ],
    context: {
      commit: "abc123",
      ref: "refs/heads/main",
      timestamp: "2026-01-01T00:00:00Z",
      runner: "Linux/X64",
    },
  };

  it("produces an OtlpMetricsDocument with one resourceMetrics entry", () => {
    const doc = benchmarkResultToOtlp(baseResult, {
      runId: "run-1",
      sourceFormat: "go",
    });
    assert.equal(doc.resourceMetrics.length, 1);
  });

  it("sets required resource attributes from options", () => {
    const doc = benchmarkResultToOtlp(baseResult, {
      runId: "run-1",
      sourceFormat: "go",
      kind: "workflow",
    });
    const attrs = otlpAttributesToRecord(doc.resourceMetrics[0].resource?.attributes);
    assert.equal(attrs["benchkit.run_id"], "run-1");
    assert.equal(attrs["benchkit.source_format"], "go");
    assert.equal(attrs["benchkit.kind"], "workflow");
  });

  it("defaults kind to 'code' when not specified", () => {
    const doc = benchmarkResultToOtlp(baseResult, {
      runId: "run-1",
      sourceFormat: "go",
    });
    const attrs = otlpAttributesToRecord(doc.resourceMetrics[0].resource?.attributes);
    assert.equal(attrs["benchkit.kind"], "code");
  });

  it("sets context fields as resource attributes", () => {
    const doc = benchmarkResultToOtlp(baseResult, {
      runId: "run-1",
      sourceFormat: "go",
    });
    const attrs = otlpAttributesToRecord(doc.resourceMetrics[0].resource?.attributes);
    assert.equal(attrs["benchkit.commit"], "abc123");
    assert.equal(attrs["benchkit.ref"], "refs/heads/main");
    assert.equal(attrs["benchkit.runner"], "Linux/X64");
  });

  it("omits optional resource attributes when context fields are absent", () => {
    const result: BenchmarkResult = {
      benchmarks: baseResult.benchmarks,
      context: { timestamp: "2026-01-01T00:00:00Z" },
    };
    const doc = benchmarkResultToOtlp(result, {
      runId: "run-1",
      sourceFormat: "go",
    });
    const attrs = otlpAttributesToRecord(doc.resourceMetrics[0].resource?.attributes);
    assert.equal(attrs["benchkit.commit"], undefined);
    assert.equal(attrs["benchkit.ref"], undefined);
    assert.equal(attrs["benchkit.runner"], undefined);
  });

  it("creates gauge metrics for each unique metric name", () => {
    const doc = benchmarkResultToOtlp(baseResult, {
      runId: "run-1",
      sourceFormat: "go",
    });
    const metrics = doc.resourceMetrics[0].scopeMetrics?.[0]?.metrics ?? [];
    assert.equal(metrics.length, 2);
    const names = metrics.map((m) => m.name);
    assert.ok(names.includes("ns_per_op"));
    assert.ok(names.includes("bytes_per_op"));
  });

  it("sets metric unit", () => {
    const doc = benchmarkResultToOtlp(baseResult, {
      runId: "run-1",
      sourceFormat: "go",
    });
    const metrics = doc.resourceMetrics[0].scopeMetrics?.[0]?.metrics ?? [];
    const nsPerOp = metrics.find((m) => m.name === "ns_per_op");
    assert.equal(nsPerOp?.unit, "ns/op");
  });

  it("omits unit when not defined on metric", () => {
    const result: BenchmarkResult = {
      benchmarks: [
        { name: "Bench", metrics: { count: { value: 42 } } },
      ],
    };
    const doc = benchmarkResultToOtlp(result, {
      runId: "run-1",
      sourceFormat: "native",
    });
    const metrics = doc.resourceMetrics[0].scopeMetrics?.[0]?.metrics ?? [];
    assert.equal(metrics[0].unit, undefined);
  });

  it("sets datapoint value as asDouble", () => {
    const doc = benchmarkResultToOtlp(baseResult, {
      runId: "run-1",
      sourceFormat: "go",
    });
    const metrics = doc.resourceMetrics[0].scopeMetrics?.[0]?.metrics ?? [];
    const nsPerOp = metrics.find((m) => m.name === "ns_per_op");
    assert.equal(nsPerOp?.gauge?.dataPoints?.[0]?.asDouble, 320);
  });

  it("sets scenario and series on datapoint attributes", () => {
    const doc = benchmarkResultToOtlp(baseResult, {
      runId: "run-1",
      sourceFormat: "go",
    });
    const dp = doc.resourceMetrics[0].scopeMetrics?.[0]?.metrics?.[0]?.gauge?.dataPoints?.[0];
    const dpAttrs = otlpAttributesToRecord(dp?.attributes);
    assert.equal(dpAttrs["benchkit.scenario"], "BenchmarkSort");
    assert.equal(dpAttrs["benchkit.series"], "BenchmarkSort");
  });

  it("sets metric direction on datapoint attributes", () => {
    const doc = benchmarkResultToOtlp(baseResult, {
      runId: "run-1",
      sourceFormat: "go",
    });
    const metrics = doc.resourceMetrics[0].scopeMetrics?.[0]?.metrics ?? [];
    const nsPerOp = metrics.find((m) => m.name === "ns_per_op");
    const dpAttrs = otlpAttributesToRecord(nsPerOp?.gauge?.dataPoints?.[0]?.attributes);
    assert.equal(dpAttrs["benchkit.metric.direction"], "smaller_is_better");
  });

  it("omits direction when not defined on metric", () => {
    const doc = benchmarkResultToOtlp(baseResult, {
      runId: "run-1",
      sourceFormat: "go",
    });
    const metrics = doc.resourceMetrics[0].scopeMetrics?.[0]?.metrics ?? [];
    const bytesPerOp = metrics.find((m) => m.name === "bytes_per_op");
    const dpAttrs = otlpAttributesToRecord(bytesPerOp?.gauge?.dataPoints?.[0]?.attributes);
    assert.equal(dpAttrs["benchkit.metric.direction"], undefined);
  });

  it("forwards benchmark tags as datapoint attributes", () => {
    const result: BenchmarkResult = {
      benchmarks: [
        {
          name: "IngestHTTP",
          tags: { env: "staging", impl: "v2" },
          metrics: { rps: { value: 15000 } },
        },
      ],
    };
    const doc = benchmarkResultToOtlp(result, {
      runId: "run-1",
      sourceFormat: "native",
    });
    const dp = doc.resourceMetrics[0].scopeMetrics?.[0]?.metrics?.[0]?.gauge?.dataPoints?.[0];
    const dpAttrs = otlpAttributesToRecord(dp?.attributes);
    assert.equal(dpAttrs["env"], "staging");
    assert.equal(dpAttrs["impl"], "v2");
  });

  it("groups multiple benchmarks with same metric into one OTLP metric", () => {
    const result: BenchmarkResult = {
      benchmarks: [
        { name: "BenchA", metrics: { ns_per_op: { value: 100 } } },
        { name: "BenchB", metrics: { ns_per_op: { value: 200 } } },
      ],
    };
    const doc = benchmarkResultToOtlp(result, {
      runId: "run-1",
      sourceFormat: "go",
    });
    const metrics = doc.resourceMetrics[0].scopeMetrics?.[0]?.metrics ?? [];
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].name, "ns_per_op");
    assert.equal(metrics[0].gauge?.dataPoints?.length, 2);
  });

  it("converts timestamp to nanoseconds", () => {
    const doc = benchmarkResultToOtlp(baseResult, {
      runId: "run-1",
      sourceFormat: "go",
    });
    const dp = doc.resourceMetrics[0].scopeMetrics?.[0]?.metrics?.[0]?.gauge?.dataPoints?.[0];
    // 2026-01-01T00:00:00Z in nanoseconds
    const expectedNanos = String(BigInt(new Date("2026-01-01T00:00:00Z").getTime()) * 1_000_000n);
    assert.equal(dp?.timeUnixNano, expectedNanos);
  });

  it("handles empty benchmarks array", () => {
    const result: BenchmarkResult = { benchmarks: [] };
    const doc = benchmarkResultToOtlp(result, {
      runId: "run-1",
      sourceFormat: "native",
    });
    assert.equal(doc.resourceMetrics.length, 1);
    const metrics = doc.resourceMetrics[0].scopeMetrics?.[0]?.metrics ?? [];
    assert.equal(metrics.length, 0);
  });
});
