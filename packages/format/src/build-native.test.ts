import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildNativeResult } from "./build-native.js";

describe("buildNativeResult", () => {
  it("builds a minimal valid result with a bare number metric", () => {
    const result = buildNativeResult({
      benchmarks: [{ name: "sort", metrics: { ns_per_op: 320 } }],
    });
    assert.equal(result.benchmarks.length, 1);
    assert.equal(result.benchmarks[0].name, "sort");
    assert.equal(result.benchmarks[0].metrics.ns_per_op.value, 320);
  });

  it("builds a result with a full metric object", () => {
    const result = buildNativeResult({
      benchmarks: [
        {
          name: "http-ingest",
          metrics: {
            events_per_sec: {
              value: 13240.5,
              unit: "events/sec",
              direction: "bigger_is_better",
            },
          },
        },
      ],
    });
    const m = result.benchmarks[0].metrics.events_per_sec;
    assert.equal(m.value, 13240.5);
    assert.equal(m.unit, "events/sec");
    assert.equal(m.direction, "bigger_is_better");
  });

  it("builds a result with multiple metrics", () => {
    const result = buildNativeResult({
      benchmarks: [
        {
          name: "bench",
          metrics: {
            throughput: { value: 500, unit: "MB/s", direction: "bigger_is_better" },
            latency:    { value: 2.1, unit: "ms",   direction: "smaller_is_better" },
            rss_mb:     { value: 128, unit: "mb",   direction: "smaller_is_better" },
          },
        },
      ],
    });
    assert.equal(Object.keys(result.benchmarks[0].metrics).length, 3);
    assert.equal(result.benchmarks[0].metrics.throughput.value, 500);
    assert.equal(result.benchmarks[0].metrics.latency.value, 2.1);
    assert.equal(result.benchmarks[0].metrics.rss_mb.value, 128);
  });

  it("builds a result with tags", () => {
    const result = buildNativeResult({
      benchmarks: [
        {
          name: "bench",
          tags: { scenario: "json-ingest", cpu: "0.5" },
          metrics: { value: 42 },
        },
      ],
    });
    assert.deepEqual(result.benchmarks[0].tags, { scenario: "json-ingest", cpu: "0.5" });
  });

  it("omits tags field when empty tags object given", () => {
    const result = buildNativeResult({
      benchmarks: [{ name: "bench", tags: {}, metrics: { v: 1 } }],
    });
    assert.equal(result.benchmarks[0].tags, undefined);
  });

  it("builds a result with samples", () => {
    const result = buildNativeResult({
      benchmarks: [
        {
          name: "bench",
          metrics: { eps: 1000 },
          samples: [
            { t: 0, eps: 950 },
            { t: 1, eps: 1050 },
          ],
        },
      ],
    });
    assert.equal(result.benchmarks[0].samples?.length, 2);
    assert.equal(result.benchmarks[0].samples?.[0].eps, 950);
    assert.equal(result.benchmarks[0].samples?.[1].t, 1);
  });

  it("builds a result with context metadata", () => {
    const result = buildNativeResult({
      benchmarks: [{ name: "bench", metrics: { v: 1 } }],
      context: {
        commit: "abc123",
        ref: "main",
        timestamp: "2025-01-01T00:00:00Z",
        runner: "ubuntu-latest",
      },
    });
    assert.equal(result.context?.commit, "abc123");
    assert.equal(result.context?.ref, "main");
    assert.equal(result.context?.runner, "ubuntu-latest");
  });

  it("omits context field when no context is given", () => {
    const result = buildNativeResult({
      benchmarks: [{ name: "bench", metrics: { v: 1 } }],
    });
    assert.equal(result.context, undefined);
  });

  it("builds a result with multiple benchmark entries", () => {
    const result = buildNativeResult({
      benchmarks: [
        { name: "bench-a", metrics: { value: 1 } },
        { name: "bench-b", metrics: { value: 2 } },
      ],
    });
    assert.equal(result.benchmarks.length, 2);
    assert.equal(result.benchmarks[0].name, "bench-a");
    assert.equal(result.benchmarks[1].name, "bench-b");
  });

  it("includes range in metric when provided", () => {
    const result = buildNativeResult({
      benchmarks: [
        { name: "bench", metrics: { latency: { value: 42, unit: "ms", range: 3 } } },
      ],
    });
    assert.equal(result.benchmarks[0].metrics.latency.range, 3);
  });

  it("throws when benchmarks array is empty", () => {
    assert.throws(
      () => buildNativeResult({ benchmarks: [] }),
      { message: /benchmarks.*non-empty/ },
    );
  });

  it("throws when a benchmark has an invalid direction", () => {
    assert.throws(
      () =>
        buildNativeResult({
          benchmarks: [
            {
              name: "bench",
              metrics: {
                v: { value: 1, direction: "upward" as "bigger_is_better" },
              },
            },
          ],
        }),
      { message: /direction/ },
    );
  });

  it("throws when a metric value is not a number", () => {
    assert.throws(
      () =>
        buildNativeResult({
          benchmarks: [
            {
              name: "bench",
              metrics: {
                v: { value: NaN },
              },
            },
          ],
        }),
      { message: /numeric.*value/ },
    );
  });
});
