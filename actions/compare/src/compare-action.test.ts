import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseCurrentRun, readBaselineRuns, runComparison } from "./compare-action.js";
import type { OtlpMetricsDocument } from "@benchkit/format";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "benchkit-compare-test-"));
}

function makeAttribute(key: string, value: string) {
  return { key, value: { stringValue: value } };
}

function makeGaugeDataPoint(
  scenario: string,
  series: string,
  value: number,
  direction: string = "smaller_is_better",
) {
  return {
    attributes: [
      makeAttribute("benchkit.scenario", scenario),
      makeAttribute("benchkit.series", series),
      makeAttribute("benchkit.metric.direction", direction),
    ],
    timeUnixNano: "1700000000000000000",
    asDouble: value,
  };
}

function makeOtlpDoc(
  metrics: Array<{
    name: string;
    unit?: string;
    gauge: { dataPoints: ReturnType<typeof makeGaugeDataPoint>[] };
  }>,
): OtlpMetricsDocument {
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            makeAttribute("benchkit.run_id", "test-run-1"),
            makeAttribute("benchkit.kind", "code"),
            makeAttribute("benchkit.source_format", "native"),
          ],
        },
        scopeMetrics: [{ metrics }],
      },
    ],
  };
}

function writeOtlpDoc(dir: string, name: string, doc: OtlpMetricsDocument): string {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(doc) + "\n");
  return file;
}

describe("parseCurrentRun", () => {
  it("parses OTLP JSON files", () => {
    const dir = makeTmpDir();
    try {
      const doc = makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchSort", "default", 100)] } },
      ]);
      const file = writeOtlpDoc(dir, "result.otlp.json", doc);
      const result = parseCurrentRun([file]);
      assert.equal(result.resourceMetrics.length, 1);
      assert.equal(result.resourceMetrics[0].scopeMetrics?.[0].metrics?.length, 1);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("merges multiple OTLP files", () => {
    const dir = makeTmpDir();
    try {
      const doc1 = makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100)] } },
      ]);
      const doc2 = makeOtlpDoc([
        { name: "ops_per_sec", unit: "ops/s", gauge: { dataPoints: [makeGaugeDataPoint("BenchB", "default", 500, "bigger_is_better")] } },
      ]);
      const file1 = writeOtlpDoc(dir, "result1.otlp.json", doc1);
      const file2 = writeOtlpDoc(dir, "result2.otlp.json", doc2);
      const result = parseCurrentRun([file1, file2]);
      assert.equal(result.resourceMetrics.length, 2);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("throws when no files are provided", () => {
    assert.throws(() => parseCurrentRun([]), /No benchmark result files/);
  });
});

describe("readBaselineRuns", () => {
  it("returns empty when runs directory is missing", () => {
    assert.deepEqual(readBaselineRuns("/definitely/missing/path", 5), []);
  });

  it("loads the most recent .otlp.json files up to maxRuns", () => {
    const dir = makeTmpDir();
    try {
      writeOtlpDoc(dir, "100-1.otlp.json", makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100)] } },
      ]));
      writeOtlpDoc(dir, "101-1.otlp.json", makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 110)] } },
      ]));
      writeOtlpDoc(dir, "102-1.otlp.json", makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 120)] } },
      ]));
      const baseline = readBaselineRuns(dir, 2);
      assert.equal(baseline.length, 2);
      // Most recent files first (reverse sort): 102, then 101
      const firstValue = baseline[0].resourceMetrics[0].scopeMetrics?.[0].metrics?.[0].gauge?.dataPoints?.[0].asDouble;
      const secondValue = baseline[1].resourceMetrics[0].scopeMetrics?.[0].metrics?.[0].gauge?.dataPoints?.[0].asDouble;
      assert.equal(firstValue, 120);
      assert.equal(secondValue, 110);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  it("ignores non-.otlp.json files", () => {
    const dir = makeTmpDir();
    try {
      writeOtlpDoc(dir, "100-1.otlp.json", makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100)] } },
      ]));
      // Write a plain .json file that should be ignored
      fs.writeFileSync(path.join(dir, "old-format.json"), JSON.stringify({ benchmarks: [] }));
      const baseline = readBaselineRuns(dir, 5);
      assert.equal(baseline.length, 1);
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
      const currentFile = writeOtlpDoc(currentDir, "current.otlp.json", makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100)] } },
      ]));
      const { markdown, hasRegression } = runComparison({
        files: [currentFile],
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
      writeOtlpDoc(runsDir, "100-1.otlp.json", makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 100, "smaller_is_better")] } },
      ]));
      const currentFile = writeOtlpDoc(currentDir, "current.otlp.json", makeOtlpDoc([
        { name: "ns_per_op", unit: "ns/op", gauge: { dataPoints: [makeGaugeDataPoint("BenchA", "default", 120, "smaller_is_better")] } },
      ]));
      const { markdown, hasRegression } = runComparison({
        files: [currentFile],
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
