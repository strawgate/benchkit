import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatComparisonMarkdown } from "./format-comparison-markdown.js";
import type { ComparisonResult } from "./types.js";

function makeResult(overrides: Partial<ComparisonResult> = {}): ComparisonResult {
  return {
    entries: [],
    hasRegression: false,
    ...overrides,
  };
}

describe("formatComparisonMarkdown", () => {
  it("returns empty-state message when there are no entries", () => {
    const output = formatComparisonMarkdown(makeResult());
    assert.ok(output.includes("No comparable benchmarks found"));
    assert.ok(output.includes("## Benchmark Comparison"));
  });

  it("uses custom title", () => {
    const output = formatComparisonMarkdown(makeResult(), { title: "PR Benchmark Results" });
    assert.ok(output.includes("## PR Benchmark Results"));
  });

  it("renders a table with header and divider", () => {
    const result = makeResult({
      entries: [
        {
          benchmark: "BenchmarkSort",
          metric: "ns_per_op",
          unit: "ns/op",
          direction: "smaller_is_better",
          baseline: 100,
          current: 120,
          percentChange: 20,
          status: "regressed",
        },
      ],
      hasRegression: true,
    });
    const output = formatComparisonMarkdown(result);
    assert.ok(output.includes("| Benchmark | Metric |"));
    assert.ok(output.includes("|-----------|"));
    assert.ok(output.includes("BenchmarkSort"));
    assert.ok(output.includes("ns_per_op"));
  });

  it("shows regression icon and summary for regressions", () => {
    const result = makeResult({
      entries: [
        {
          benchmark: "BenchA",
          metric: "ns_per_op",
          unit: "ns/op",
          direction: "smaller_is_better",
          baseline: 100,
          current: 150,
          percentChange: 50,
          status: "regressed",
        },
      ],
      hasRegression: true,
    });
    const output = formatComparisonMarkdown(result);
    assert.ok(output.includes("❌"));
    assert.ok(output.includes("1 regression(s) detected"));
    assert.ok(output.includes("`BenchA/ns_per_op`"));
  });

  it("shows improvement icon and summary when no regressions and improvements exist", () => {
    const result = makeResult({
      entries: [
        {
          benchmark: "BenchA",
          metric: "ns_per_op",
          unit: "ns/op",
          direction: "smaller_is_better",
          baseline: 100,
          current: 80,
          percentChange: -20,
          status: "improved",
        },
      ],
      hasRegression: false,
    });
    const output = formatComparisonMarkdown(result);
    assert.ok(output.includes("✅"));
    assert.ok(output.includes("1 improvement(s) detected"));
    assert.ok(output.includes("+0") === false); // change should show -20.00%
    assert.ok(output.includes("-20.00%"));
  });

  it("shows stable summary when all are stable", () => {
    const result = makeResult({
      entries: [
        {
          benchmark: "BenchA",
          metric: "ns_per_op",
          unit: "ns/op",
          direction: "smaller_is_better",
          baseline: 100,
          current: 102,
          percentChange: 2,
          status: "stable",
        },
      ],
      hasRegression: false,
    });
    const output = formatComparisonMarkdown(result);
    assert.ok(output.includes("All benchmarks are stable"));
  });

  it("formats positive change with + prefix", () => {
    const result = makeResult({
      entries: [
        {
          benchmark: "BenchA",
          metric: "ns_per_op",
          direction: "smaller_is_better",
          baseline: 100,
          current: 110,
          percentChange: 10,
          status: "regressed",
        },
      ],
      hasRegression: true,
    });
    const output = formatComparisonMarkdown(result);
    assert.ok(output.includes("+10.00%"));
  });

  it("formats large numbers with K/M suffix", () => {
    const result = makeResult({
      entries: [
        {
          benchmark: "BenchA",
          metric: "ops",
          unit: "ops/s",
          direction: "bigger_is_better",
          baseline: 1_500_000,
          current: 1_200_000,
          percentChange: -20,
          status: "regressed",
        },
      ],
      hasRegression: true,
    });
    const output = formatComparisonMarkdown(result);
    assert.ok(output.includes("1.50M") || output.includes("1.20M"));
  });

  it("renders multiple rows", () => {
    const result = makeResult({
      entries: [
        {
          benchmark: "BenchA",
          metric: "ns_per_op",
          unit: "ns/op",
          direction: "smaller_is_better",
          baseline: 100,
          current: 120,
          percentChange: 20,
          status: "regressed",
        },
        {
          benchmark: "BenchB",
          metric: "ns_per_op",
          unit: "ns/op",
          direction: "smaller_is_better",
          baseline: 200,
          current: 190,
          percentChange: -5,
          status: "stable",
        },
        {
          benchmark: "BenchC",
          metric: "ops_per_sec",
          unit: "ops/s",
          direction: "bigger_is_better",
          baseline: 1000,
          current: 1200,
          percentChange: 20,
          status: "improved",
        },
      ],
      hasRegression: true,
    });
    const output = formatComparisonMarkdown(result);
    assert.ok(output.includes("BenchA"));
    assert.ok(output.includes("BenchB"));
    assert.ok(output.includes("BenchC"));
    assert.ok(output.includes("2 regression") === false); // only 1 regression
    assert.ok(output.includes("1 regression(s) detected"));
  });

  it("omits unit from values when unit is undefined", () => {
    const result = makeResult({
      entries: [
        {
          benchmark: "BenchA",
          metric: "score",
          direction: "bigger_is_better",
          baseline: 100,
          current: 110,
          percentChange: 10,
          status: "improved",
        },
      ],
      hasRegression: false,
    });
    const output = formatComparisonMarkdown(result);
    // Should not have trailing spaces or "undefined"
    assert.ok(!output.includes("undefined"));
    assert.ok(output.includes("BenchA"));
  });
});
