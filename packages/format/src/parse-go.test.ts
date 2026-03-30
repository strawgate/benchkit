import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseGoBench } from "./parse-go.js";

describe("parseGoBench", () => {
  it("parses a single benchmark line", () => {
    const input = `BenchmarkFib20-8        30000        41653 ns/op`;
    const result = parseGoBench(input);

    assert.equal(result.benchmarks.length, 1);
    assert.equal(result.benchmarks[0].name, "BenchmarkFib20");
    assert.deepEqual(result.benchmarks[0].tags, { procs: "8" });
    assert.equal(result.benchmarks[0].metrics.ns_per_op.value, 41653);
    assert.equal(result.benchmarks[0].metrics.ns_per_op.unit, "ns/op");
    assert.equal(
      result.benchmarks[0].metrics.ns_per_op.direction,
      "smaller_is_better",
    );
  });

  it("parses multiple metrics per line", () => {
    const input = `BenchmarkScanner-8    5000    234567 ns/op    4096 B/op    12 allocs/op`;
    const result = parseGoBench(input);

    assert.equal(result.benchmarks.length, 1);
    const metrics = result.benchmarks[0].metrics;
    assert.equal(Object.keys(metrics).length, 3);
    assert.equal(metrics.ns_per_op.value, 234567);
    assert.equal(metrics.bytes_per_op.value, 4096);
    assert.equal(metrics.allocs_per_op.value, 12);
  });

  it("parses multiple benchmark lines", () => {
    const input = [
      "goos: linux",
      "goarch: amd64",
      "pkg: github.com/example/pkg",
      "BenchmarkA-8    10000    12345 ns/op",
      "BenchmarkB-8    20000     6789 ns/op",
      "PASS",
      "ok      github.com/example/pkg  2.345s",
    ].join("\n");

    const result = parseGoBench(input);
    assert.equal(result.benchmarks.length, 2);
    assert.equal(result.benchmarks[0].name, "BenchmarkA");
    assert.equal(result.benchmarks[1].name, "BenchmarkB");
  });

  it("handles benchmarks without procs suffix", () => {
    const input = `BenchmarkSimple      50000        30000 ns/op`;
    const result = parseGoBench(input);

    assert.equal(result.benchmarks.length, 1);
    assert.equal(result.benchmarks[0].name, "BenchmarkSimple");
    assert.equal(result.benchmarks[0].tags, undefined);
  });

  it("handles MB/s as bigger_is_better", () => {
    const input = `BenchmarkRead-8    1000    500000 ns/op    200.00 MB/s`;
    const result = parseGoBench(input);

    assert.equal(
      result.benchmarks[0].metrics.mb_per_s.direction,
      "bigger_is_better",
    );
  });

  it("returns empty benchmarks for non-benchmark input", () => {
    const input = "just some random text\nno benchmarks here";
    const result = parseGoBench(input);
    assert.equal(result.benchmarks.length, 0);
  });
});
