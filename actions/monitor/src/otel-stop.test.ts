import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { isProcessRunning, safeUnlink, stopCollector } from "./otel-stop.js";
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
