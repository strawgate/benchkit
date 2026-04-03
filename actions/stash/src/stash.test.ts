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
  parseBenchmarkFiles,
  parseBenchmarks,
  readMonitorOutput,
  writeResultFile,
} from "./stash.js";
import type { Benchmark, BenchmarkResult } from "@benchkit/format";

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

  it("builds a result from benchmarks and context", () => {
    const result = buildResult({ benchmarks: baseBenchmarks, context: baseContext });
    assert.equal(result.benchmarks.length, 1);
    assert.equal(result.benchmarks[0].name, "BenchmarkSort");
    assert.equal(result.context?.commit, "abc123");
    assert.equal(result.context?.ref, "refs/heads/main");
    assert.equal(result.context?.runner, "Linux/X64");
    assert.equal(result.context?.monitor, undefined);
  });

  it("merges monitor benchmarks and context", () => {
    const monitorResult: BenchmarkResult = {
      benchmarks: [
        { name: "_monitor/system", metrics: { cpu_user_pct: { value: 45 } } },
      ],
      context: {
        monitor: {
          monitor_version: "0.1.0",
          poll_interval_ms: 250,
          duration_ms: 5000,
        },
      },
    };
    const result = buildResult({
      benchmarks: baseBenchmarks,
      monitorResult,
      context: baseContext,
    });
    assert.equal(result.benchmarks.length, 2);
    assert.equal(result.benchmarks[0].name, "BenchmarkSort");
    assert.equal(result.benchmarks[1].name, "_monitor/system");
    assert.deepEqual(result.context?.monitor, {
      monitor_version: "0.1.0",
      poll_interval_ms: 250,
      duration_ms: 5000,
    });
  });

  it("does not mutate input benchmarks array", () => {
    const input = [...baseBenchmarks];
    const monitorResult: BenchmarkResult = {
      benchmarks: [{ name: "_monitor/x", metrics: { m: { value: 1 } } }],
    };
    buildResult({ benchmarks: input, monitorResult, context: baseContext });
    assert.equal(input.length, 1, "original array should not be modified");
  });

  it("omits runner from context when undefined", () => {
    const result = buildResult({
      benchmarks: baseBenchmarks,
      context: { ...baseContext, runner: undefined },
    });
    assert.equal(result.context?.runner, undefined);
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
  it("reads and parses a monitor output file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "stash-test-"));
    const monitorFile = path.join(tmpDir, "monitor.json");
    fs.writeFileSync(monitorFile, JSON.stringify({
      benchmarks: [
        { name: "_monitor/process/go", metrics: { peak_rss_kb: { value: 50000 } } },
      ],
      context: {
        monitor: { monitor_version: "0.1.0", poll_interval_ms: 250, duration_ms: 3000 },
      },
    }));

    const result = readMonitorOutput(monitorFile);
    assert.equal(result.benchmarks.length, 1);
    assert.equal(result.benchmarks[0].name, "_monitor/process/go");
    assert.equal(result.context?.monitor?.poll_interval_ms, 250);
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
      assert.throws(() => readMonitorOutput(filePath), {
        message: /Failed to parse native input/,
      });
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("throws when benchmarks key is missing", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "benchkit-stash-test-"));
    const filePath = path.join(tmpDir, "monitor.json");
    try {
      fs.writeFileSync(filePath, JSON.stringify({ context: { timestamp: "2024-01-01T00:00:00Z" } }));
      assert.throws(
        () => readMonitorOutput(filePath),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(
            err.message.includes("benchmarks"),
            `Expected 'benchmarks' in error message: ${err.message}`,
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
  it("writes a result file to disk", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "benchkit-stash-test-"));
    try {
      const outputPath = path.join(tmpDir, "nested", "result.json");
      const result: BenchmarkResult = {
        benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 100 } } }],
      };
      const writtenPath = writeResultFile(result, "run-1", outputPath);
      assert.equal(writtenPath, outputPath);
      const parsed = JSON.parse(fs.readFileSync(outputPath, "utf-8")) as BenchmarkResult;
      assert.equal(parsed.benchmarks[0].name, "BenchA");
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it("creates a temp result path that includes the run id", () => {
    const resultPath = createTempResultPath("1234-1");
    assert.ok(resultPath.includes("1234-1"));
    assert.ok(resultPath.endsWith(".json"));
  });
});

describe("formatResultSummaryMarkdown", () => {
  it("formats benchmarks and monitor metrics for GITHUB_STEP_SUMMARY", () => {
    const result: BenchmarkResult = {
      benchmarks: [
        {
          name: "mock-http-ingest",
          metrics: {
            events_per_sec: { value: 13240.5, unit: "events/sec", direction: "bigger_is_better" },
            service_rss_mb: { value: 543.1, unit: "MB", direction: "smaller_is_better" },
          },
        },
        {
          name: "_monitor/system",
          metrics: {
            cpu_user_pct: { value: 71.2, unit: "%" },
          },
        },
      ],
      context: {
        commit: "abcdef1234567890",
        ref: "refs/pull/42/merge",
      },
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
| \`_monitor/system\` | \`cpu_user_pct\`: 71.2 % |

</details>
`,
    );
  });

  it("omits the monitor details block when no monitor benchmarks exist", () => {
    const result: BenchmarkResult = {
      benchmarks: [{ name: "BenchA", metrics: { ns_per_op: { value: 100, unit: "ns/op" } } }],
    };
    const markdown = formatResultSummaryMarkdown(result, { runId: "run-1" });
    assert.doesNotMatch(markdown, /Monitor metrics/);
    assert.match(markdown, /BenchA/);
  });
});
