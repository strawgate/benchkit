import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildNativeResult,
  defineBenchmark,
  defineMetric,
  stringifyNativeResult,
} from "./native-builder.js";
import { parseNative } from "./parse-native.js";

describe("native-builder", () => {
  it("defines a metric and infers direction from unit", () => {
    const metric = defineMetric(13240.5, { unit: "events/sec" });
    assert.deepEqual(metric, {
      value: 13240.5,
      unit: "events/sec",
      direction: "bigger_is_better",
      range: undefined,
    });
  });

  it("builds a benchmark from numeric shorthand and rich metric inputs", () => {
    const benchmark = defineBenchmark({
      name: "mock-http-ingest",
      tags: { scenario: "json-ingest", kind: "workflow" },
      metrics: {
        parse_errors: 0,
        events_per_sec: { value: 13240.5, unit: "events/sec" },
        p95_batch_ms: { value: 143.2, unit: "ms", direction: "smaller_is_better" },
      },
      samples: [{ t: 0, events_per_sec: 0 }, { t: 1, events_per_sec: 11884.2 }],
    });

    assert.equal(benchmark.name, "mock-http-ingest");
    assert.equal(benchmark.metrics.parse_errors.value, 0);
    assert.equal(benchmark.metrics.events_per_sec.direction, "bigger_is_better");
    assert.equal(benchmark.metrics.p95_batch_ms.direction, "smaller_is_better");
    assert.equal(benchmark.samples?.length, 2);
  });

  it("builds a full native benchmark result", () => {
    const result = buildNativeResult({
      context: {
        commit: "abcdef123456",
        ref: "refs/heads/main",
        timestamp: "2026-04-01T00:00:00Z",
      },
      benchmarks: [
        {
          name: "mock-http-ingest",
          tags: { scenario: "json-ingest" },
          metrics: {
            events_per_sec: { value: 13240.5, unit: "events/sec" },
            service_rss_mb: { value: 543.1, unit: "MB", direction: "smaller_is_better" },
          },
        },
      ],
    });

    assert.equal(result.context?.commit, "abcdef123456");
    assert.equal(result.benchmarks[0].metrics.events_per_sec.direction, "bigger_is_better");
  });

  it("stringifies a build input to valid native JSON", () => {
    const output = stringifyNativeResult({
      context: {
        ref: "refs/heads/main",
        timestamp: "2026-04-01T00:00:00Z",
      },
      benchmarks: [
        {
          name: "mock-http-ingest",
          metrics: {
            events_per_sec: { value: 13240.5, unit: "events/sec" },
            service_rss_mb: { value: 543.1, unit: "MB", direction: "smaller_is_better" },
          },
        },
      ],
    });

    const parsed = parseNative(output);
    assert.equal(parsed.benchmarks[0].name, "mock-http-ingest");
    assert.equal(parsed.benchmarks[0].metrics.events_per_sec.direction, "bigger_is_better");
    assert.match(output, /\n$/);
  });

  it("stringifies an existing benchmark result without changing it", () => {
    const output = stringifyNativeResult({
      benchmarks: [
        {
          name: "passthrough",
          metrics: {
            events_total: {
              value: 1000000,
              unit: "events",
              direction: "bigger_is_better",
            },
          },
        },
      ],
    });

    const parsed = JSON.parse(output) as {
      benchmarks: Array<{ metrics: Record<string, { value: number; direction?: string }> }>;
    };
    assert.equal(parsed.benchmarks[0].metrics.events_total.value, 1000000);
    assert.equal(parsed.benchmarks[0].metrics.events_total.direction, "bigger_is_better");
  });
});
