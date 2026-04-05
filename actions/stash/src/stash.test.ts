import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  buildResult,
  buildRunId,
  createTempResultPath,
  formatResultSummaryMarkdown,
  getEmptyBenchmarksWarning,
  parseBenchmarkFiles,
  parseBenchmarks,
  readMonitorOutput,
  writeResultFile,
} from "./stash.js";
import type { Benchmark, OtlpMetricsDocument } from "@benchkit/format";
import { otlpAttributesToRecord } from "@benchkit/format";

// ── buildRunId ──────────────────────────────────────────────────────

describe("buildRunId", () => {
  it("returns the custom run-id unchanged when provided", () => {
    assert.equal(
      buildRunId({ customRunId: "my-custom-run" }),
      "my-custom-run",
    );
  });

  it("ignores all other options when customRunId is set", () => {
    assert.equal(
      buildRunId({ customRunId: "custom", githubRunId: "99", githubJob: "bench" }),
      "custom",
    );
  });

  it("builds base id from run id and attempt", () => {
    assert.equal(
      buildRunId({ githubRunId: "12345", githubRunAttempt: "2" }),
      "12345-2",
    );
  });

  it("appends sanitized job name separated by double dash", () => {
    assert.equal(
      buildRunId({ githubRunId: "12345", githubRunAttempt: "1", githubJob: "bench" }),
      "12345-1--bench",
    );
  });

  it("lower-cases the job segment", () => {
    assert.equal(
      buildRunId({ githubRunId: "12345", githubRunAttempt: "1", githubJob: "BenchGo" }),
      "12345-1--benchgo",
    );
  });

  it("replaces spaces and special characters with dashes in job segment", () => {
    assert.equal(
      buildRunId({ githubRunId: "12345", githubRunAttempt: "1", githubJob: "My Bench (Linux)" }),
      "12345-1--my-bench-linux",
    );
  });

  it("collapses consecutive special characters to a single dash", () => {
    assert.equal(
      buildRunId({ githubRunId: "1", githubRunAttempt: "1", githubJob: "a  b__c" }),
      "1-1--a-b-c",
    );
  });

  it("strips leading and trailing dashes from the job segment", () => {
    assert.equal(
      buildRunId({ githubRunId: "1", githubRunAttempt: "1", githubJob: "---bench---" }),
      "1-1--bench",
    );
  });

  it("falls back to base id when job sanitizes to empty string", () => {
    assert.equal(
      buildRunId({ githubRunId: "1", githubRunAttempt: "1", githubJob: "!!!" }),
      "1-1",
    );
  });

  it("uses 'local' and attempt '1' as fallbacks when env vars are absent", () => {
    assert.equal(
      buildRunId({}),
      "local-1",
    );
  });

  it("uses attempt '1' as fallback when only run id is provided", () => {
    assert.equal(
      buildRunId({ githubRunId: "42" }),
      "42-1",
    );
  });
});

// ── buildResult ─────────────────────────────────────────────────────

describe("buildResult", () => {
  const baseBenchmarks: Benchmark[] = [
    { name: "BenchmarkSort", metrics: { ns_per_op: { value: 320, unit: "ns/op" } } },
  ];
  const baseContext = {
    commit: "abc123",
    ref: "refs/heads/main",
    timestamp: "2026-01-01T00:00:00Z",
    runner: "Linux/X64",
  };

  it("builds an OtlpMetricsDocument from benchmarks and context", () => {
    const result = buildResult({
      benchmarks: baseBenchmarks,
      runId: "test-1",
      sourceFormat: "go",
      context: baseContext,
    });
    assert.equal(result.resourceMetrics.length, 1);
    const attrs = otlpAttributesToRecord(result.resourceMetrics[0].resource?.attributes);
    assert.equal(attrs["benchkit.commit"], "abc123");
    assert.equal(attrs["benchkit.ref"], "refs/heads/main");
    assert.equal(attrs["benchkit.runner"], "Linux/X64");
    assert.equal(attrs["benchkit.run_id"], "test-1");
    assert.equal(attrs["benchkit.source_format"], "go");

    const metrics = result.resourceMetrics[0].scopeMetrics?.[0]?.metrics ?? [];
    assert.equal(metrics.length, 1);
    assert.equal(metrics[0].name, "ns_per_op");
    assert.equal(metrics[0].unit, "ns/op");
    assert.equal(metrics[0].gauge?.dataPoints?.[0]?.asDouble, 320);
  });

  it("merges monitor OTLP document", () => {
    const monitorDoc: OtlpMetricsDocument = {
      resourceMetrics: [{
        resource: {
          attributes: [
            { key: "benchkit.run_id", value: { stringValue: "test-1" } },
            { key: "benchkit.kind", value: { stringValue: "workflow" } },
            { key: "benchkit.source_format", value: { stringValue: "otlp" } },
          ],
        },
        scopeMetrics: [{
          metrics: [{
            name: "_monitor.cpu_user_pct",
            unit: "%",
            gauge: {
              dataPoints: [{
                asDouble: 45,
                attributes: [
                  { key: "benchkit.scenario", value: { stringValue: "system" } },
                  { key: "benchkit.series", value: { stringValue: "runner" } },
                ],
              }],
            },
          }],
        }],
      }],
    };
    const result = buildResult({
      benchmarks: baseBenchmarks,
      monitorDoc,
      runId: "test-1",
      sourceFormat: "go",
      context: baseContext,
    });
    assert.equal(result.resourceMetrics.length, 2);
    // First resource is benchmark data
    const benchMetrics = result.resourceMetrics[0].scopeMetrics?.[0]?.metrics ?? [];
    assert.equal(benchMetrics[0].name, "ns_per_op");
    // Second resource is monitor data
    const monitorMetrics = result.resourceMetrics[1].scopeMetrics?.[0]?.metrics ?? [];
    assert.equal(monitorMetrics[0].name, "_monitor.cpu_user_pct");
  });

  it("does not mutate input benchmarks array", () => {
    const input = [...baseBenchmarks];
    const monitorDoc: OtlpMetricsDocument = {
      resourceMetrics: [{
        resource: { attributes: [] },
        scopeMetrics: [{ metrics: [{ name: "_monitor.x", gauge: { dataPoints: [{ asDouble: 1, attributes: [{ key: "benchkit.scenario", value: { stringValue: "x" } }, { key: "benchkit.series", value: { stringValue: "x" } }] }] } }] }],
      }],
    };
    buildResult({ benchmarks: input, monitorDoc, runId: "test-1", sourceFormat: "go", context: baseContext });
    assert.equal(input.length, 1, "original array should not be modified");
  });

  it("omits runner from resource attributes when undefined", () => {
    const result = buildResult({
      benchmarks: baseBenchmarks,
      runId: "test-1",
      sourceFormat: "go",
      context: { ...baseContext, runner: undefined },
    });
    const attrs = otlpAttributesToRecord(result.resourceMetrics[0].resource?.attributes);
    assert.equal(attrs["benchkit.runner"], undefined);
  });
});

// ── parseBenchmarkFiles ─────────────────────────────────────────────

describe("parseBenchmarkFiles", () => {
  let tmpDir: string;

  it("parses Go bench files", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-test-"));
    const goFile = path.join(tmpDir, "bench.txt");
    fs.writeFileSync(goFile, [
      "BenchmarkSort-4  5000000  320 ns/op  48 B/op  2 allocs/op",
      "BenchmarkSearch-4  10000000  120 ns/op  0 B/op  0 allocs/op",
    ].join("\n"));

    const benchmarks = parseBenchmarkFiles([goFile], "go");
    assert.equal(benchmarks.length, 2);
    assert.equal(benchmarks[0].name, "BenchmarkSort");
    assert.ok(benchmarks[0].metrics.ns_per_op);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("parses native JSON files", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-test-"));
    const nativeFile = path.join(tmpDir, "results.json");
    fs.writeFileSync(nativeFile, JSON.stringify({
      benchmarks: [
        { name: "http-throughput", metrics: { rps: { value: 15230 } } },
      ],
    }));

    const benchmarks = parseBenchmarkFiles([nativeFile], "native");
    assert.equal(benchmarks.length, 1);
    assert.equal(benchmarks[0].name, "http-throughput");
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("concatenates benchmarks from multiple files", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-test-"));
    const f1 = path.join(tmpDir, "a.txt");
    const f2 = path.join(tmpDir, "b.txt");
    fs.writeFileSync(f1, "BenchmarkA-4  1000  100 ns/op");
    fs.writeFileSync(f2, "BenchmarkB-4  2000  200 ns/op");

    const benchmarks = parseBenchmarkFiles([f1, f2], "go");
    assert.equal(benchmarks.length, 2);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("throws on empty file list", () => {
    assert.throws(() => parseBenchmarkFiles([], "go"), /No benchmark result files/);
  });
});

describe("getEmptyBenchmarksWarning", () => {
  it("returns a warning when parsing produced no benchmarks", () => {
    assert.match(
      getEmptyBenchmarksWarning([]) ?? "",
      /Parsed 0 benchmarks from the provided file\(s\)/,
    );
  });

  it("does not warn when at least one benchmark was parsed", () => {
    assert.equal(
      getEmptyBenchmarksWarning([{ name: "BenchmarkSort", metrics: { ns_per_op: { value: 320 } } }]),
      undefined,
    );
  });
});

// ── parseBenchmarks failure paths ────────────────────────────────────

describe("parseBenchmarks", () => {
  it("throws a descriptive error for malformed native JSON", () => {
    assert.throws(
      () => parseBenchmarks("{ not valid json }", "native", "results.json"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("results.json"),
          `Expected filename in error: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("throws when native JSON is missing benchmarks array", () => {
    const content = JSON.stringify({ context: { timestamp: "2024-01-01T00:00:00Z" } });
    assert.throws(
      () => parseBenchmarks(content, "native", "bench.json"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("bench.json"),
          `Expected filename in error: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("throws for an unknown format", () => {
    assert.throws(
      () => parseBenchmarks("any content", "unknown" as never, "file.txt"),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("file.txt"),
          `Expected filename in error: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("returns benchmarks for valid native JSON", () => {
    const content = JSON.stringify({
      benchmarks: [
        { name: "BenchSort", metrics: { ns_per_op: { value: 320, unit: "ns/op" } } },
      ],
    });
    const benchmarks = parseBenchmarks(content, "native", "results.json");
    assert.equal(benchmarks.length, 1);
    assert.equal(benchmarks[0].name, "BenchSort");
  });

  it("returns benchmarks when auto-detecting Go format", () => {
    const goOutput = [
      "goos: linux",
      "goarch: amd64",
      "BenchmarkSort-8   1000   1234 ns/op   48 B/op   2 allocs/op",
      "PASS",
    ].join("\n");
    const benchmarks = parseBenchmarks(goOutput, "auto", "bench.txt");
    assert.ok(benchmarks.length >= 1);
    assert.equal(benchmarks[0].name, "BenchmarkSort");
  });
});

// ── readMonitorOutput ───────────────────────────────────────────────

describe("readMonitorOutput", () => {
  it("reads and parses a single OTLP JSON monitor file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-test-"));
    const monitorFile = path.join(tmpDir, "monitor.otlp.json");
    const otlpDoc: OtlpMetricsDocument = {
      resourceMetrics: [{
        resource: {
          attributes: [
            { key: "benchkit.run_id", value: { stringValue: "run-1" } },
            { key: "benchkit.kind", value: { stringValue: "workflow" } },
            { key: "benchkit.source_format", value: { stringValue: "otlp" } },
          ],
        },
        scopeMetrics: [{
          metrics: [{
            name: "_monitor.cpu_user_pct",
            unit: "%",
            gauge: {
              dataPoints: [{
                asDouble: 45,
                attributes: [
                  { key: "benchkit.scenario", value: { stringValue: "system" } },
                  { key: "benchkit.series", value: { stringValue: "runner" } },
                ],
              }],
            },
          }],
        }],
      }],
    };
    fs.writeFileSync(monitorFile, JSON.stringify(otlpDoc));

    const result = readMonitorOutput(monitorFile);
    assert.equal(result.resourceMetrics.length, 1);
    const metrics = result.resourceMetrics[0].scopeMetrics?.[0]?.metrics ?? [];
    assert.equal(metrics[0].name, "_monitor.cpu_user_pct");
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("reads and merges OTLP JSONL monitor file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-test-"));
    const monitorFile = path.join(tmpDir, "monitor.otlp.jsonl");
    const line1 = JSON.stringify({
      resourceMetrics: [{
        resource: { attributes: [{ key: "benchkit.run_id", value: { stringValue: "run-1" } }, { key: "benchkit.kind", value: { stringValue: "workflow" } }, { key: "benchkit.source_format", value: { stringValue: "otlp" } }] },
        scopeMetrics: [{ metrics: [{ name: "_monitor.cpu_user_pct", gauge: { dataPoints: [{ asDouble: 45, attributes: [{ key: "benchkit.scenario", value: { stringValue: "system" } }, { key: "benchkit.series", value: { stringValue: "runner" } }] }] } }] }],
      }],
    });
    const line2 = JSON.stringify({
      resourceMetrics: [{
        resource: { attributes: [{ key: "benchkit.run_id", value: { stringValue: "run-1" } }, { key: "benchkit.kind", value: { stringValue: "workflow" } }, { key: "benchkit.source_format", value: { stringValue: "otlp" } }] },
        scopeMetrics: [{ metrics: [{ name: "_monitor.mem_rss_mb", gauge: { dataPoints: [{ asDouble: 512, attributes: [{ key: "benchkit.scenario", value: { stringValue: "system" } }, { key: "benchkit.series", value: { stringValue: "runner" } }] }] } }] }],
      }],
    });
    fs.writeFileSync(monitorFile, `${line1}\n${line2}\n`);

    const result = readMonitorOutput(monitorFile);
    assert.equal(result.resourceMetrics.length, 2);
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("throws when the monitor file does not exist", () => {
    const missing = path.join(os.tmpdir(), `benchkit-no-monitor-${Date.now()}.json`);
    assert.throws(
      () => readMonitorOutput(missing),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.ok(
          err.message.includes("Monitor file not found"),
          `Expected 'Monitor file not found' in: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("throws on invalid JSON content", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "benchkit-stash-test-"));
    const filePath = path.join(tmpDir, "monitor.json");
    try {
      fs.writeFileSync(filePath, "{ not valid json }");
      assert.throws(() => readMonitorOutput(filePath));
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("throws when resourceMetrics key is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "benchkit-stash-test-"));
    const filePath = path.join(tmpDir, "monitor.json");
    try {
      fs.writeFileSync(filePath, JSON.stringify({ context: { timestamp: "2024-01-01T00:00:00Z" } }));
      assert.throws(
        () => readMonitorOutput(filePath),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(
            err.message.includes("resourceMetrics"),
            `Expected 'resourceMetrics' in error message: ${err.message}`,
          );
          return true;
        },
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});

// ── file writing / summary helpers ───────────────────────────────────

describe("writeResultFile", () => {
  it("writes an OTLP result file to disk", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "benchkit-stash-test-"));
    try {
      const outputPath = path.join(tmpDir, "nested", "result.otlp.json");
      const result: OtlpMetricsDocument = {
        resourceMetrics: [{
          resource: {
            attributes: [
              { key: "benchkit.run_id", value: { stringValue: "run-1" } },
              { key: "benchkit.kind", value: { stringValue: "code" } },
              { key: "benchkit.source_format", value: { stringValue: "go" } },
            ],
          },
          scopeMetrics: [{
            metrics: [{
              name: "ns_per_op",
              unit: "ns/op",
              gauge: {
                dataPoints: [{
                  asDouble: 100,
                  attributes: [
                    { key: "benchkit.scenario", value: { stringValue: "BenchA" } },
                    { key: "benchkit.series", value: { stringValue: "BenchA" } },
                  ],
                }],
              },
            }],
          }],
        }],
      };
      const writtenPath = writeResultFile(result, "run-1", outputPath);
      assert.equal(writtenPath, outputPath);
      const parsed = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as OtlpMetricsDocument;
      assert.equal(parsed.resourceMetrics[0].scopeMetrics?.[0]?.metrics?.[0]?.name, "ns_per_op");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("creates a temp result path that includes the run id and .otlp.json extension", () => {
    const resultPath = createTempResultPath("1234-1");
    assert.ok(resultPath.includes("1234-1"));
    assert.ok(resultPath.endsWith(".otlp.json"));
  });
});

describe("formatResultSummaryMarkdown", () => {
  it("formats benchmarks and monitor metrics for GITHUB_STEP_SUMMARY", () => {
    const result: OtlpMetricsDocument = {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: "benchkit.run_id", value: { stringValue: "12345-1" } },
              { key: "benchkit.kind", value: { stringValue: "workflow" } },
              { key: "benchkit.source_format", value: { stringValue: "native" } },
              { key: "benchkit.commit", value: { stringValue: "abcdef1234567890" } },
              { key: "benchkit.ref", value: { stringValue: "refs/pull/42/merge" } },
            ],
          },
          scopeMetrics: [{
            metrics: [
              {
                name: "events_per_sec",
                unit: "events/sec",
                gauge: {
                  dataPoints: [{
                    asDouble: 13240.5,
                    attributes: [
                      { key: "benchkit.scenario", value: { stringValue: "mock-http-ingest" } },
                      { key: "benchkit.series", value: { stringValue: "mock-http-ingest" } },
                    ],
                  }],
                },
              },
              {
                name: "service_rss_mb",
                unit: "MB",
                gauge: {
                  dataPoints: [{
                    asDouble: 543.1,
                    attributes: [
                      { key: "benchkit.scenario", value: { stringValue: "mock-http-ingest" } },
                      { key: "benchkit.series", value: { stringValue: "mock-http-ingest" } },
                    ],
                  }],
                },
              },
            ],
          }],
        },
        {
          resource: { attributes: [] },
          scopeMetrics: [{
            metrics: [{
              name: "_monitor.cpu_user_pct",
              unit: "%",
              gauge: {
                dataPoints: [{
                  asDouble: 71.2,
                  attributes: [
                    { key: "benchkit.scenario", value: { stringValue: "system" } },
                    { key: "benchkit.series", value: { stringValue: "runner" } },
                  ],
                }],
              },
            }],
          }],
        },
      ],
    };

    const markdown = formatResultSummaryMarkdown(result, { runId: "12345-1" });
    assert.equal(
      markdown,
      `## Benchkit Stash

Run ID: \`12345-1\`
Parsed for commit \`abcdef12\` on ref \`refs/pull/42/merge\`.

### Benchmarks

| Benchmark | Metrics |
| --- | --- |
| \`mock-http-ingest\` | \`events_per_sec\`: 13240.5 events/sec<br>\`service_rss_mb\`: 543.1 MB |

<details>
<summary>Monitor metrics</summary>

| Benchmark | Metrics |
| --- | --- |
| \`system\` | \`_monitor.cpu_user_pct\`: 71.2 % |

</details>
`,
    );
  });

  it("omits the monitor details block when no monitor metrics exist", () => {
    const result: OtlpMetricsDocument = {
      resourceMetrics: [{
        resource: { attributes: [] },
        scopeMetrics: [{
          metrics: [{
            name: "ns_per_op",
            unit: "ns/op",
            gauge: {
              dataPoints: [{
                asDouble: 100,
                attributes: [
                  { key: "benchkit.scenario", value: { stringValue: "BenchA" } },
                  { key: "benchkit.series", value: { stringValue: "BenchA" } },
                ],
              }],
            },
          }],
        }],
      }],
    };
    const markdown = formatResultSummaryMarkdown(result, { runId: "run-1" });
    assert.doesNotMatch(markdown, /Monitor metrics/);
    assert.match(markdown, /BenchA/);
  });
});
