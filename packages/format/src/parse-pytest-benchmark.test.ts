import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePytestBenchmark } from "./parse-pytest-benchmark.js";
import { parse } from "./parse.js";

const PYTEST_BENCHMARK_OUTPUT = JSON.stringify({
  benchmarks: [
    {
      name: "test_sort",
      fullname: "tests/test_perf.py::test_sort",
      stats: {
        min: 0.000123,
        max: 0.000156,
        mean: 0.000134,
        stddev: 0.0000089,
        rounds: 1000,
        median: 0.000132,
        ops: 7462.68,
      },
    },
    {
      name: "test_search",
      fullname: "tests/test_perf.py::test_search",
      stats: {
        min: 0.000050,
        max: 0.000080,
        mean: 0.000063,
        stddev: 0.000005,
        rounds: 2000,
        median: 0.000062,
        ops: 15873.02,
      },
    },
  ],
});

describe("parsePytestBenchmark", () => {
  it("parses pytest-benchmark JSON output", () => {
    const result = parsePytestBenchmark(PYTEST_BENCHMARK_OUTPUT);

    assert.equal(result.benchmarks.length, 2);

    const sortBench = result.benchmarks.find((b) => b.name === "test_sort");
    assert.ok(sortBench);

    assert.deepEqual(sortBench?.metrics.mean, {
      value: 0.000134,
      unit: "s",
      direction: "smaller_is_better",
      range: 0.0000089,
    });
    assert.deepEqual(sortBench?.metrics.median, {
      value: 0.000132,
      unit: "s",
      direction: "smaller_is_better",
    });
    assert.deepEqual(sortBench?.metrics.min, {
      value: 0.000123,
      unit: "s",
      direction: "smaller_is_better",
    });
    assert.deepEqual(sortBench?.metrics.max, {
      value: 0.000156,
      unit: "s",
      direction: "smaller_is_better",
    });
    assert.deepEqual(sortBench?.metrics.stddev, {
      value: 0.0000089,
      unit: "s",
      direction: "smaller_is_better",
    });
    assert.deepEqual(sortBench?.metrics.ops, {
      value: 7462.68,
      unit: "ops/s",
      direction: "bigger_is_better",
    });
    assert.deepEqual(sortBench?.metrics.rounds, {
      value: 1000,
      direction: "bigger_is_better",
    });
  });

  it("parses multiple benchmarks", () => {
    const result = parsePytestBenchmark(PYTEST_BENCHMARK_OUTPUT);

    const searchBench = result.benchmarks.find((b) => b.name === "test_search");
    assert.ok(searchBench);
    assert.equal(searchBench?.metrics.mean.value, 0.000063);
    assert.equal(searchBench?.metrics.ops.value, 15873.02);
    assert.equal(searchBench?.metrics.rounds.value, 2000);
  });

  it("auto-detects pytest-benchmark format", () => {
    const result = parse(PYTEST_BENCHMARK_OUTPUT);
    assert.equal(result.benchmarks.length, 2);
    assert.equal(result.benchmarks[0].name, "test_sort");
  });

  it("auto-detects native format when benchmarks lack stats", () => {
    const nativeInput = JSON.stringify({
      benchmarks: [
        { name: "test", metrics: { eps: { value: 100 } } },
      ],
    });
    const result = parse(nativeInput);
    assert.equal(result.benchmarks[0].name, "test");
  });

  it("throws on missing benchmarks array", () => {
    assert.throws(() => parsePytestBenchmark('{"foo": "bar"}'), {
      message: "pytest-benchmark format must have a 'benchmarks' array.",
    });
  });

  it("throws when an entry lacks a stats object", () => {
    assert.throws(
      () =>
        parsePytestBenchmark(
          JSON.stringify({ benchmarks: [{ name: "bad_bench" }] }),
        ),
      { message: /stats/ },
    );
  });
});
