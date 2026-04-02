import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { isProcessRunning, safeUnlink, stopCollector, filterBaselineProcesses } from "./otel-stop.js";
import type { OtelState } from "./types.js";

// ── isProcessRunning ────────────────────────────────────────────────

describe("isProcessRunning", () => {
  it("returns true for the current process", () => {
    assert.equal(isProcessRunning(process.pid), true);
  });

  it("returns false for pid 0", () => {
    assert.equal(isProcessRunning(0), false);
  });

  it("returns false for negative pid", () => {
    assert.equal(isProcessRunning(-1), false);
  });

  it("returns false for a non-existent pid", () => {
    // PID 99999999 is extremely unlikely to exist
    assert.equal(isProcessRunning(99999999), false);
  });
});

// ── safeUnlink ──────────────────────────────────────────────────────

describe("safeUnlink", () => {
  it("removes an existing file", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "otel-stop-test-"));
    const filePath = path.join(tmpDir, "test.txt");
    fs.writeFileSync(filePath, "hello");
    assert.ok(fs.existsSync(filePath));

    safeUnlink(filePath);
    assert.ok(!fs.existsSync(filePath));
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("does not throw for a non-existent file", () => {
    assert.doesNotThrow(() => safeUnlink("/tmp/this-file-does-not-exist-12345"));
  });
});

// ── stopCollector ───────────────────────────────────────────────────

describe("stopCollector", () => {
  it("handles an already-exited process gracefully", async () => {
    const state: OtelState = {
      pid: 99999999, // non-existent
      configPath: "/tmp/fake-config.yaml",
      outputPath: "/tmp/fake-output.jsonl",
      startTime: Date.now(),
      runId: "test-1",
      dataBranch: "bench-data",
    };
    // Should not throw
    await stopCollector(state);
  });

  it("stops a real child process via SIGTERM", async () => {
    // Spawn a long-running process (sleep)
    const child = spawn("sleep", ["60"], { detached: true, stdio: "ignore" });
    child.unref();
    const pid = child.pid!;
    assert.ok(pid > 0);
    assert.ok(isProcessRunning(pid), "child should be running");

    const state: OtelState = {
      pid,
      configPath: "/tmp/fake-config.yaml",
      outputPath: "/tmp/fake-output.jsonl",
      startTime: Date.now(),
      runId: "test-2",
      dataBranch: "bench-data",
    };

    await stopCollector(state);

    // Give OS a moment to reap the process
    await new Promise((r) => setTimeout(r, 100));
    assert.ok(!isProcessRunning(pid), "child should be stopped");
  });
});

// ── Config YAML structural validation ───────────────────────────────

describe("generated config structural validation", () => {
  // Import config generator here to test that the output is valid
  // by checking key structural properties
  it("generates config that has all required top-level sections", async () => {
    const { generateCollectorConfig } = await import("./otel-config.js");
    const yaml = generateCollectorConfig({
      scrapeInterval: "1s",
      metricSets: ["cpu", "memory"],
      otlpGrpcPort: 4317,
      otlpHttpPort: 4318,
      outputPath: "/tmp/test.jsonl",
      runId: "test-run-1",
      ref: "refs/heads/main",
      commit: "abc123",
    });

    // Must have all top-level sections
    const lines = yaml.split("\n");
    const topLevelKeys = lines
      .filter((l) => /^\w/.test(l) && l.includes(":"))
      .map((l) => l.split(":")[0]);

    assert.ok(topLevelKeys.includes("receivers"), "must have receivers section");
    assert.ok(topLevelKeys.includes("processors"), "must have processors section");
    assert.ok(topLevelKeys.includes("exporters"), "must have exporters section");
    assert.ok(topLevelKeys.includes("service"), "must have service section");
  });

  it("generates consistent indentation (2-space)", async () => {
    const { generateCollectorConfig } = await import("./otel-config.js");
    const yaml = generateCollectorConfig({
      scrapeInterval: "1s",
      metricSets: ["cpu"],
      otlpGrpcPort: 4317,
      otlpHttpPort: 0,
      outputPath: "/tmp/test.jsonl",
      runId: "test-1",
    });

    // Every indented line should use multiples of 2 spaces
    const indentedLines = yaml.split("\n").filter((l) => l.startsWith(" "));
    for (const line of indentedLines) {
      const leadingSpaces = line.match(/^( *)/)![1].length;
      assert.equal(
        leadingSpaces % 2,
        0,
        `Line has odd indentation (${leadingSpaces} spaces): "${line}"`,
      );
    }
  });
});

// ── filterBaselineProcesses ─────────────────────────────────────────

function makeResourceMetric(pid: number | undefined, metricName: string) {
  const attributes: Array<{ key: string; value: Record<string, unknown> }> = [];
  if (pid !== undefined) {
    attributes.push({ key: "process.pid", value: { intValue: String(pid) } });
    attributes.push({ key: "process.executable.name", value: { stringValue: `proc-${pid}` } });
  }
  return {
    resource: { attributes },
    scopeMetrics: [{
      scope: { name: "otelcol/hostmetricsreceiver/process" },
      metrics: [{ name: metricName, gauge: { dataPoints: [{ asDouble: 42 }] } }],
    }],
  };
}

function makeJsonlLine(...resources: ReturnType<typeof makeResourceMetric>[]) {
  return JSON.stringify({ resourceMetrics: resources });
}

describe("filterBaselineProcesses", () => {
  it("removes resources with baseline PIDs", () => {
    const line = makeJsonlLine(
      makeResourceMetric(100, "process.cpu.time"),
      makeResourceMetric(200, "process.cpu.time"),
    );
    const { filtered, kept, removed } = filterBaselineProcesses(line, new Set([100, 150]));
    assert.equal(removed, 1);
    assert.equal(kept, 1);
    const parsed = JSON.parse(filtered.trim());
    assert.equal(parsed.resourceMetrics.length, 1);
    assert.equal(parsed.resourceMetrics[0].resource.attributes[0].value.intValue, "200");
  });

  it("keeps system metrics (no process.pid)", () => {
    const line = makeJsonlLine(
      makeResourceMetric(undefined, "system.cpu.time"),
      makeResourceMetric(100, "process.cpu.time"),
    );
    const { filtered, kept, removed } = filterBaselineProcesses(line, new Set([100]));
    assert.equal(kept, 1);
    assert.equal(removed, 1);
    const parsed = JSON.parse(filtered.trim());
    assert.equal(parsed.resourceMetrics.length, 1);
    assert.equal(parsed.resourceMetrics[0].scopeMetrics[0].metrics[0].name, "system.cpu.time");
  });

  it("keeps all resources when baseline is empty", () => {
    const line = makeJsonlLine(
      makeResourceMetric(100, "process.cpu.time"),
      makeResourceMetric(200, "process.cpu.time"),
    );
    const { kept, removed } = filterBaselineProcesses(line, new Set());
    assert.equal(kept, 2);
    assert.equal(removed, 0);
  });

  it("drops entire JSONL line if all resources are baseline", () => {
    const line = makeJsonlLine(
      makeResourceMetric(100, "process.cpu.time"),
      makeResourceMetric(200, "process.cpu.time"),
    );
    const { filtered, removed } = filterBaselineProcesses(line, new Set([100, 200]));
    assert.equal(removed, 2);
    assert.equal(filtered.trim(), "");
  });

  it("handles multi-line JSONL", () => {
    const lines = [
      makeJsonlLine(makeResourceMetric(100, "process.cpu.time"), makeResourceMetric(500, "process.cpu.time")),
      makeJsonlLine(makeResourceMetric(100, "process.memory.usage"), makeResourceMetric(500, "process.memory.usage")),
    ].join("\n");
    const { kept, removed } = filterBaselineProcesses(lines, new Set([100]));
    assert.equal(kept, 2);
    assert.equal(removed, 2);
  });

  it("handles intValue as number (not string)", () => {
    const resource = {
      resource: { attributes: [{ key: "process.pid", value: { intValue: 100 } }] },
      scopeMetrics: [],
    };
    const line = JSON.stringify({ resourceMetrics: [resource] });
    const { removed } = filterBaselineProcesses(line, new Set([100]));
    assert.equal(removed, 1);
  });
});
