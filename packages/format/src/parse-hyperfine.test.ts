import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseHyperfine } from "./parse-hyperfine.js";
import { parse } from "./parse.js";

const HYPERFINE_OUTPUT = JSON.stringify({
  results: [
    {
      command: "sort input.txt",
      mean: 0.123,
      stddev: 0.005,
      median: 0.121,
      min: 0.115,
      max: 0.135,
      times: [0.115, 0.121, 0.123, 0.135],
    },
    {
      command: "ls -l",
      mean: 0.01,
      stddev: 0.001,
      median: 0.01,
      min: 0.009,
      max: 0.012,
      times: [0.009, 0.01, 0.01, 0.012],
    },
  ],
});

describe("parseHyperfine", () => {
  it("parses hyperfine JSON output", () => {
    const result = parseHyperfine(HYPERFINE_OUTPUT);

    assert.equal(result.benchmarks.length, 2);

    const sortBench = result.benchmarks.find((b) => b.name === "sort input.txt");
    assert.ok(sortBench);
    assert.deepEqual(sortBench?.metrics.mean, {
      value: 0.123,
      unit: "s",
      direction: "smaller_is_better",
      range: 0.005,
    });
    assert.deepEqual(sortBench?.metrics.stddev, {
      value: 0.005,
      unit: "s",
      direction: "smaller_is_better",
    });
    assert.deepEqual(sortBench?.metrics.median, {
      value: 0.121,
      unit: "s",
      direction: "smaller_is_better",
    });
    assert.deepEqual(sortBench?.metrics.min, {
      value: 0.115,
      unit: "s",
      direction: "smaller_is_better",
    });
    assert.deepEqual(sortBench?.metrics.max, {
      value: 0.135,
      unit: "s",
      direction: "smaller_is_better",
    });

    const lsBench = result.benchmarks.find((b) => b.name === "ls -l");
    assert.ok(lsBench);
    assert.equal(lsBench?.metrics.mean.value, 0.01);
  });

  it("auto-detects hyperfine format", () => {
    const result = parse(HYPERFINE_OUTPUT);
    assert.equal(result.benchmarks.length, 2);
    assert.equal(result.benchmarks[0].name, "sort input.txt");
  });

  it("throws on invalid hyperfine JSON", () => {
    assert.throws(() => parseHyperfine('{"foo": "bar"}'), {
      message: /\[parse-hyperfine\].*results/,
    });
  });
});
