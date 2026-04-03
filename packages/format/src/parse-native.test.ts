import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseNative } from "./parse-native.js";

describe("parseNative", () => {
  it("parses a valid native result", () => {
    const input = JSON.stringify({
      benchmarks: [
        {
          name: "sort",
          metrics: { ns_per_op: { value: 320, unit: "ns/op" } },
        },
      ],
    });
    const result = parseNative(input);
    assert.equal(result.benchmarks.length, 1);
    assert.equal(result.benchmarks[0].name, "sort");
    assert.equal(result.benchmarks[0].metrics.ns_per_op.value, 320);
  });

  it("preserves context when present", () => {
    const input = JSON.stringify({
      benchmarks: [
        { name: "a", metrics: { v: { value: 1 } } },
      ],
      context: {
        commit: "abc123",
        timestamp: "2025-01-01T00:00:00Z",
        monitor: {
          monitor_version: "0.1.0",
          poll_interval_ms: 500,
          duration_ms: 10000,
        },
      },
    });
    const result = parseNative(input);
    assert.equal(result.context?.commit, "abc123");
    assert.equal(result.context?.monitor?.monitor_version, "0.1.0");
  });

  it("preserves tags and samples", () => {
    const input = JSON.stringify({
      benchmarks: [
        {
          name: "sort",
          tags: { size: "1000" },
          metrics: { ns_per_op: { value: 320 } },
          samples: [{ t: 0, ns_per_op: 310 }, { t: 1, ns_per_op: 330 }],
        },
      ],
    });
    const result = parseNative(input);
    assert.deepEqual(result.benchmarks[0].tags, { size: "1000" });
    assert.equal(result.benchmarks[0].samples?.length, 2);
  });

  it("validates metric direction values", () => {
    const input = JSON.stringify({
      benchmarks: [
        {
          name: "a",
          metrics: {
            v: { value: 1, direction: "bigger_is_better" },
          },
        },
      ],
    });
    const result = parseNative(input);
    assert.equal(
      result.benchmarks[0].metrics.v.direction,
      "bigger_is_better",
    );
  });

  it("throws on missing benchmarks array", () => {
    assert.throws(() => parseNative("{}"), {
      message: /benchmarks/,
    });
  });

  it("throws on non-array benchmarks", () => {
    assert.throws(() => parseNative('{"benchmarks": "not-array"}'), {
      message: /benchmarks/,
    });
  });

  it("throws on benchmark missing name", () => {
    const input = JSON.stringify({
      benchmarks: [{ metrics: { v: { value: 1 } } }],
    });
    assert.throws(() => parseNative(input), {
      message: /name/,
    });
  });

  it("throws on benchmark missing metrics", () => {
    const input = JSON.stringify({
      benchmarks: [{ name: "a" }],
    });
    assert.throws(() => parseNative(input), {
      message: /metrics/,
    });
  });

  it("throws on non-numeric metric value", () => {
    const input = JSON.stringify({
      benchmarks: [
        { name: "a", metrics: { v: { value: "not-a-number" } } },
      ],
    });
    assert.throws(() => parseNative(input), {
      message: /numeric.*value/,
    });
  });

  it("throws on invalid direction", () => {
    const input = JSON.stringify({
      benchmarks: [
        {
          name: "a",
          metrics: { v: { value: 1, direction: "invalid" } },
        },
      ],
    });
    assert.throws(() => parseNative(input), {
      message: /direction/,
    });
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => parseNative("not-json"), {
      message: /Failed to parse native input/,
    });
  });
});
