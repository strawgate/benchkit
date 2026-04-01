import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
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

// ── parseCurrentRun ─────────────────────────────────────────────────

describe("parseCurrentRun", () => {
  it("parses a native JSON file", () => {
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

  it("parses a Go bench file", () => {
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

  it("concatenates benchmarks from multiple files", () => {
    const dir = makeTmpDir();
    try {
      const f1 = writeResult(dir, "a.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 100 } } }],
      });
      const f2 = writeResult(dir, "b.json", {
        benchmarks: [{ name: "BenchB", metrics: { ns_per_op: { value: 200 } } }],
      });
      const result = parseCurrentRun([f1, f2], "native");
      assert.equal(result.benchmarks.length, 2);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("throws on empty file list", () => {
    assert.throws(() => parseCurrentRun([], "native"), /No benchmark result files/);
  });
});

// ── readBaselineRuns ────────────────────────────────────────────────

describe("readBaselineRuns", () => {
  it("returns empty array when runs directory does not exist", () => {
    const result = readBaselineRuns("/nonexistent/path", 5);
    assert.deepEqual(result, []);
  });

  it("reads JSON files from runs directory", () => {
    const dir = makeTmpDir();
    try {
      writeResult(dir, "100-1.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 100 } } }],
      });
      writeResult(dir, "101-1.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 110 } } }],
      });
      const results = readBaselineRuns(dir, 5);
      assert.equal(results.length, 2);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("limits to maxRuns most recent files", () => {
    const dir = makeTmpDir();
    try {
      for (let i = 1; i <= 10; i++) {
        writeResult(dir, `${String(i).padStart(3, "0")}-1.json`, {
          benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: i * 100 } } }],
        });
      }
      const results = readBaselineRuns(dir, 3);
      assert.equal(results.length, 3);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("ignores non-JSON files", () => {
    const dir = makeTmpDir();
    try {
      writeResult(dir, "100-1.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 100 } } }],
      });
      fs.writeFileSync(path.join(dir, "README.md"), "not a benchmark");
      const results = readBaselineRuns(dir, 5);
      assert.equal(results.length, 1);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

// ── runComparison ───────────────────────────────────────────────────

describe("runComparison", () => {
  it("returns no-regression result when no baseline exists", () => {
    const dir = makeTmpDir();
    const resultsDir = makeTmpDir();
    try {
      const currentFile = writeResult(resultsDir, "current.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 100 } } }],
      });
      const { markdown, hasRegression } = runComparison({
        files: [currentFile],
        format: "native",
        runsDir: path.join(dir, "nonexistent"),
        baselineRuns: 5,
        threshold: 5,
      });
      assert.equal(hasRegression, false);
      assert.ok(markdown.includes("No comparable benchmarks found"));
    } finally {
      fs.rmSync(dir, { recursive: true });
      fs.rmSync(resultsDir, { recursive: true });
    }
  });

  it("detects regression against baseline", () => {
    const runsDir = makeTmpDir();
    const resultsDir = makeTmpDir();
    try {
      writeResult(runsDir, "100-1.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 100, unit: "ns/op", direction: "smaller_is_better" } } }],
      });
      const currentFile = writeResult(resultsDir, "current.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 200, unit: "ns/op", direction: "smaller_is_better" } } }],
      });
      const { markdown, hasRegression } = runComparison({
        files: [currentFile],
        format: "native",
        runsDir,
        baselineRuns: 5,
        threshold: 5,
      });
      assert.equal(hasRegression, true);
      assert.ok(markdown.includes("regression"));
    } finally {
      fs.rmSync(runsDir, { recursive: true });
      fs.rmSync(resultsDir, { recursive: true });
    }
  });

  it("reports stable when within threshold", () => {
    const runsDir = makeTmpDir();
    const resultsDir = makeTmpDir();
    try {
      writeResult(runsDir, "100-1.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 100, unit: "ns/op", direction: "smaller_is_better" } } }],
      });
      const currentFile = writeResult(resultsDir, "current.json", {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 103, unit: "ns/op", direction: "smaller_is_better" } } }],
      });
      const { hasRegression } = runComparison({
        files: [currentFile],
        format: "native",
        runsDir,
        baselineRuns: 5,
        threshold: 5,
      });
      assert.equal(hasRegression, false);
    } finally {
      fs.rmSync(runsDir, { recursive: true });
      fs.rmSync(resultsDir, { recursive: true });
    }
  });
});
