import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseRustBench } from "./parse-rust.js";

describe("parseRustBench", () => {
  it("parses single rust benchmark", () => {
    const input = "test sort::bench_sort   ... bench:         320 ns/iter (+/- 42)";
    const result = parseRustBench(input);

    assert.equal(result.benchmarks.length, 1);
    assert.equal(result.benchmarks[0].name, "sort::bench_sort");
    assert.deepEqual(result.benchmarks[0].metrics.ns_per_iter, {
      value: 320,
      unit: "ns/iter",
      direction: "smaller_is_better",
      range: 42,
    });
  });

  it("parses multiple rust benchmarks", () => {
    const input = `
test sort::bench_sort   ... bench:         320 ns/iter (+/- 42)
test sort::bench_stable ... bench:         285 ns/iter (+/- 31)
    `;
    const result = parseRustBench(input);

    assert.equal(result.benchmarks.length, 2);
    assert.equal(result.benchmarks[0].name, "sort::bench_sort");
    assert.equal(result.benchmarks[1].name, "sort::bench_stable");
  });

  it("handles benchmarks without range", () => {
    const input = "test basic ... bench: 100 ns/iter";
    const result = parseRustBench(input);

    assert.equal(result.benchmarks[0].metrics.ns_per_iter.range, undefined);
    assert.equal(result.benchmarks[0].metrics.ns_per_iter.value, 100);
  });

  it("handles numbers with commas", () => {
    const input = "test large ... bench: 1,234,567 ns/iter (+/- 1,234)";
    const result = parseRustBench(input);

    assert.equal(result.benchmarks[0].metrics.ns_per_iter.value, 1234567);
    assert.equal(result.benchmarks[0].metrics.ns_per_iter.range, 1234);
  });

  it("skips non-benchmark lines", () => {
    const input = `
running 2 tests
test sort::bench_sort   ... bench:         320 ns/iter (+/- 42)
test sort::bench_stable ... bench:         285 ns/iter (+/- 31)
test result: ok. 0 passed; 0 failed; 0 ignored; 2 measured; 0 filtered out; finished in 0.00s
    `;
    const result = parseRustBench(input);
    assert.equal(result.benchmarks.length, 2);
  });
});
