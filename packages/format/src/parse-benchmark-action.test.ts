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

  it("throws when an entry is missing 'name'", () => {
    const input = JSON.stringify([{ value: 42, unit: "ops/sec" }]);
    assert.throws(() => parseBenchmarkAction(input), {
      message: /\[parse-benchmark-action\].*name/,
    });
  });

  it("throws when an entry has a non-numeric 'value'", () => {
    const input = JSON.stringify([{ name: "Bench", value: "fast", unit: "ops/sec" }]);
    assert.throws(() => parseBenchmarkAction(input), {
      message: /\[parse-benchmark-action\].*numeric.*value/,
    });
  });

  it("throws when an entry is missing 'unit'", () => {
    const input = JSON.stringify([{ name: "Bench", value: 42 }]);
    assert.throws(() => parseBenchmarkAction(input), {
      message: /\[parse-benchmark-action\].*unit/,
    });
  });

  it("throws when an entry is not an object", () => {
    const input = JSON.stringify(["not-an-object"]);
    assert.throws(() => parseBenchmarkAction(input), {
      message: /\[parse-benchmark-action\].*object/,
    });
  });

  it("throws contextual error on malformed JSON", () => {
    assert.throws(() => parseBenchmarkAction("not-json"), {
      message: /\[parse-benchmark-action\] Failed to parse input as JSON/,
    });
  });
});
