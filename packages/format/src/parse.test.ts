import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parse } from "./parse.js";

describe("parse (auto-detect)", () => {
  it("detects native format", () => {
    const input = JSON.stringify({
      benchmarks: [
        { name: "test", metrics: { eps: { value: 100 } } },
      ],
    });
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "test");
  });

  it("detects benchmark-action format", () => {
    const input = JSON.stringify([
      { name: "Bench", value: 42, unit: "ns/op" },
    ]);
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "Bench");
  });

  it("detects Go bench format", () => {
    const input = `BenchmarkFoo-8    10000    1234 ns/op`;
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "BenchmarkFoo");
  });

  it("detects Rust bench format", () => {
    const input = `test sort::bench_sort   ... bench:         320 ns/iter (+/- 42)`;
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "sort::bench_sort");
  });

  it("detects Hyperfine format", () => {
    const input = JSON.stringify({
      results: [{ command: "sleep 1", mean: 1.0 }],
    });
    const result = parse(input);
    assert.equal(result.benchmarks[0].name, "sleep 1");
  });

  it("throws on unrecognized input", () => {
    assert.throws(() => parse("totally unknown format"), {
      message: /Could not auto-detect/,
    });
  });

  it("respects explicit format override", () => {
    const input = `BenchmarkBar-4    5000    999 ns/op`;
    const result = parse(input, "go");
    assert.equal(result.benchmarks[0].name, "BenchmarkBar");
  });
});
