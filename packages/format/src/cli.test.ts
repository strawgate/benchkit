import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const CLI = resolve(__dirname, "cli.js");

function runCli(args: string[], opts: { cwd?: string } = {}): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      encoding: "utf-8",
      cwd: opts.cwd,
    });
    return { stdout, stderr: "", status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
      status: e.status ?? 1,
    };
  }
}

let tmpDir: string;

describe("benchkit-native CLI", () => {
  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "benchkit-cli-test-"));
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("top-level help", () => {
    it("prints help when no arguments given", () => {
      const r = runCli([]);
      assert.equal(r.status, 0);
      assert.ok(r.stdout.includes("benchkit-native"));
      assert.ok(r.stdout.includes("emit"));
    });

    it("prints help with --help", () => {
      const r = runCli(["--help"]);
      assert.equal(r.status, 0);
      assert.ok(r.stdout.includes("emit"));
    });

    it("exits with error on unknown command", () => {
      const r = runCli(["unknown-cmd"]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes("unknown command"));
    });
  });

  describe("emit subcommand", () => {
    it("prints emit help with --help", () => {
      const r = runCli(["emit", "--help"]);
      assert.equal(r.status, 0);
      assert.ok(r.stdout.includes("--name"));
      assert.ok(r.stdout.includes("--metric"));
    });

    it("emits a minimal result to stdout", () => {
      const r = runCli([
        "emit",
        "--name", "sort",
        "--metric", "ns_per_op=320",
      ]);
      assert.equal(r.status, 0);
      const result = JSON.parse(r.stdout);
      assert.equal(result.benchmarks[0].name, "sort");
      assert.equal(result.benchmarks[0].metrics.ns_per_op.value, 320);
    });

    it("emits a metric with unit", () => {
      const r = runCli([
        "emit",
        "--name", "ingest",
        "--metric", "events_per_sec=13240.5:events/sec",
      ]);
      assert.equal(r.status, 0);
      const result = JSON.parse(r.stdout);
      const m = result.benchmarks[0].metrics.events_per_sec;
      assert.equal(m.value, 13240.5);
      assert.equal(m.unit, "events/sec");
    });

    it("emits a metric with unit and direction", () => {
      const r = runCli([
        "emit",
        "--name", "ingest",
        "--metric", "events_per_sec=13240.5:events/sec:bigger_is_better",
      ]);
      assert.equal(r.status, 0);
      const result = JSON.parse(r.stdout);
      const m = result.benchmarks[0].metrics.events_per_sec;
      assert.equal(m.direction, "bigger_is_better");
    });

    it("emits multiple metrics", () => {
      const r = runCli([
        "emit",
        "--name", "http-bench",
        "--metric", "events_per_sec=13240.5:events/sec:bigger_is_better",
        "--metric", "p95_batch_ms=143.2:ms:smaller_is_better",
      ]);
      assert.equal(r.status, 0);
      const result = JSON.parse(r.stdout);
      const metrics = result.benchmarks[0].metrics;
      assert.equal(metrics.events_per_sec.value, 13240.5);
      assert.equal(metrics.p95_batch_ms.value, 143.2);
      assert.equal(metrics.p95_batch_ms.direction, "smaller_is_better");
    });

    it("emits tags", () => {
      const r = runCli([
        "emit",
        "--name", "bench",
        "--metric", "v=1",
        "--tag", "scenario=json-ingest",
        "--tag", "cpu=0.5",
      ]);
      assert.equal(r.status, 0);
      const result = JSON.parse(r.stdout);
      assert.deepEqual(result.benchmarks[0].tags, { scenario: "json-ingest", cpu: "0.5" });
    });

    it("emits context metadata", () => {
      const r = runCli([
        "emit",
        "--name", "bench",
        "--metric", "v=1",
        "--commit", "abc123",
        "--ref", "main",
        "--timestamp", "2025-01-01T00:00:00Z",
        "--runner", "ubuntu-latest",
      ]);
      assert.equal(r.status, 0);
      const result = JSON.parse(r.stdout);
      assert.equal(result.context.commit, "abc123");
      assert.equal(result.context.ref, "main");
      assert.equal(result.context.timestamp, "2025-01-01T00:00:00Z");
      assert.equal(result.context.runner, "ubuntu-latest");
    });

    it("emits samples", () => {
      const r = runCli([
        "emit",
        "--name", "bench",
        "--metric", "eps=1000",
        "--sample", "t=0,eps=950",
        "--sample", "t=1,eps=1050",
      ]);
      assert.equal(r.status, 0);
      const result = JSON.parse(r.stdout);
      const samples = result.benchmarks[0].samples;
      assert.equal(samples.length, 2);
      assert.equal(samples[0].t, 0);
      assert.equal(samples[0].eps, 950);
      assert.equal(samples[1].t, 1);
    });

    it("writes to a file with --output", () => {
      const outFile = join(tmpDir, "result.json");
      const r = runCli([
        "emit",
        "--name", "bench",
        "--metric", "v=42",
        "--output", outFile,
      ]);
      assert.equal(r.status, 0);
      assert.equal(r.stdout, "");
      const result = JSON.parse(readFileSync(outFile, "utf-8"));
      assert.equal(result.benchmarks[0].metrics.v.value, 42);
    });

    it("appends to an existing file with --append", () => {
      const outFile = join(tmpDir, "append-result.json");

      // First emit
      runCli(["emit", "--name", "bench-a", "--metric", "v=1", "--output", outFile]);

      // Second emit with --append
      const r = runCli([
        "emit",
        "--name", "bench-b",
        "--metric", "v=2",
        "--output", outFile,
        "--append",
      ]);
      assert.equal(r.status, 0);

      const result = JSON.parse(readFileSync(outFile, "utf-8"));
      assert.equal(result.benchmarks.length, 2);
      assert.equal(result.benchmarks[0].name, "bench-a");
      assert.equal(result.benchmarks[1].name, "bench-b");
    });

    it("errors when --name is missing", () => {
      const r = runCli(["emit", "--metric", "v=1"]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes("--name"));
    });

    it("errors when no --metric is given", () => {
      const r = runCli(["emit", "--name", "bench"]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes("--metric"));
    });

    it("errors on malformed metric spec (no equals sign)", () => {
      const r = runCli(["emit", "--name", "bench", "--metric", "badspec"]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes("--metric"));
    });

    it("errors on non-numeric metric value", () => {
      const r = runCli(["emit", "--name", "bench", "--metric", "v=notanumber"]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes("not a valid number"));
    });

    it("errors on invalid direction", () => {
      const r = runCli(["emit", "--name", "bench", "--metric", "v=1:ms:bad_direction"]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes("direction"));
    });

    it("errors on malformed tag spec", () => {
      const r = runCli(["emit", "--name", "bench", "--metric", "v=1", "--tag", "badtag"]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes("--tag"));
    });

    it("errors on sample missing 't' field", () => {
      const r = runCli(["emit", "--name", "bench", "--metric", "v=1", "--sample", "x=1"]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes("'t'"));
    });

    it("errors on --append without a readable output file", () => {
      const r = runCli([
        "emit",
        "--name", "bench",
        "--metric", "v=1",
        "--output", join(tmpDir, "nonexistent.json"),
        "--append",
      ]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes("--append"));
    });

    it("errors on --append with invalid existing JSON file", () => {
      const badFile = join(tmpDir, "bad.json");
      writeFileSync(badFile, "not-json", "utf-8");
      const r = runCli([
        "emit",
        "--name", "bench",
        "--metric", "v=1",
        "--output", badFile,
        "--append",
      ]);
      assert.equal(r.status, 1);
      assert.ok(r.stderr.includes("--append"));
    });
  });
});
