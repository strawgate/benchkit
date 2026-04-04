import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseCurrentRun, readBaselineRuns, runComparison } from "./compare-action.js";
import type { BenchmarkResult } from "@benchkit/format";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "benchkit-compare-test-"));
}

function writeResult(dir: string, name: string, result: BenchmarkResult): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(result) + "\n");
  return file;
}

describe("parseCurrentRun", () => {
  it("parses native JSON files", () => {
    const dir = makeTmpDir();
    try {
      const file = writeResult(dir, "result.json", {
        benchmarks: [{ name: "BenchSort", metrics: { ns_per_op: { value: 100, unit: "ns/op" } } }],
      });
      const result = parseCurrentRun([file], "native");
      assert.equal(result.benchmarks.length, 1);
      assert.equal(result.benchmarks[0].name, "BenchSort");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("parses go bench files", () => {
    const dir = makeTmpDir();
    try {
      const file = path.join(dir, "bench.txt");
      fs.writeFileSync(file, "BenchmarkSort-4  5000000  320 ns/op  48 B/op  2 allocs/op\n");
      const result = parseCurrentRun([file], "go");
      assert.ok(result.benchmarks.length >= 1);
      assert.equal(result.benchmarks[0].name, "BenchmarkSort");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("throws when no files are provided", () => {
    assert.throws(() => parseCurrentRun([], "native"), /No benchmark result files/);
  });
});

describe("readBaselineRuns", () => {
  it("returns empty when runs directory is missing", () => {
    assert.deepEqual(readBaselineRuns("/definitely/missing/path", 5), []);
  });

  it("loads the most recent json files up to maxRuns", () => {
    const dir = makeTmpDir();
    try {
      writeResult(dir, "100-1.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 100 } } }],
      });
      writeResult(dir, "101-1.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 110 } } }],
      });
      writeResult(dir, "102-1.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 120 } } }],
      });
      const baseline = readBaselineRuns(dir, 2);
      assert.equal(baseline.length, 2);
      assert.equal(baseline[0].benchmarks[0].metrics.ns_per_op.value, 120);
      assert.equal(baseline[1].benchmarks[0].metrics.ns_per_op.value, 110);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

describe("runComparison", () => {
  it("formats a no-baseline result cleanly", () => {
    const runsDir = makeTmpDir();
    const currentDir = makeTmpDir();
    try {
      const currentFile = writeResult(currentDir, "current.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 100 } } }],
      });
      const { markdown, hasRegression } = runComparison({
        files: [currentFile],
        format: "native",
        runsDir: path.join(runsDir, "missing"),
        baselineRuns: 5,
        threshold: 5,
      });
      assert.equal(hasRegression, false);
      assert.match(markdown, /No comparable baseline data found/);
    } finally {
      fs.rmSync(runsDir, { recursive: true });
      fs.rmSync(currentDir, { recursive: true });
    }
  });

  it("detects regressions against baseline runs", () => {
    const runsDir = makeTmpDir();
    const currentDir = makeTmpDir();
    try {
      writeResult(runsDir, "100-1.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 100, unit: "ns/op", direction: "smaller_is_better" } } }],
      });
      const currentFile = writeResult(currentDir, "current.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 120, unit: "ns/op", direction: "smaller_is_better" } } }],
      });
      const { markdown, hasRegression } = runComparison({
        files: [currentFile],
        format: "native",
        runsDir,
        baselineRuns: 5,
        threshold: 5,
        currentCommit: "abcdef123456",
        currentRef: "refs/pull/12/merge",
      });
      assert.equal(hasRegression, true);
      assert.match(markdown, /### Regressions/);
      assert.match(markdown, /PR #12/);
    } finally {
      fs.rmSync(runsDir, { recursive: true });
      fs.rmSync(currentDir, { recursive: true });
    }
  });
});
