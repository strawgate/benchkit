import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseBenchmarkAction } from "./parse-benchmark-action.js";

describe("parseBenchmarkAction", () => {
  it("parses a simple array of results", () => {
    const input = JSON.stringify([
      { name: "My Bench", unit: "ops/sec", value: 42000 },
      { name: "Memory", unit: "bytes", value: 1024, range: "± 50" },
    ]);

    const result = parseBenchmarkAction(input);
    assert.equal(result.benchmarks.length, 2);
    assert.equal(result.benchmarks[0].name, "My Bench");
    assert.equal(result.benchmarks[0].metrics.value.value, 42000);
    assert.equal(
      result.benchmarks[0].metrics.value.direction,
      "bigger_is_better",
    );
    assert.equal(result.benchmarks[1].metrics.value.range, 50);
  });

  it("infers smaller_is_better for ns-like units", () => {
    const input = JSON.stringify([
      { name: "Latency", unit: "ns/iter", value: 150 },
    ]);

    const result = parseBenchmarkAction(input);
    assert.equal(
      result.benchmarks[0].metrics.value.direction,
      "smaller_is_better",
    );
  });

  it("throws on non-array input", () => {
    assert.throws(() => parseBenchmarkAction('{"not": "an array"}'), {
      message: /must be a JSON array/,
    });
  });
});
