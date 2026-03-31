import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { TrackedProcess, MonitorConfig } from "./types.js";
import {
  shortName,
  shouldInclude,
  groupByName,
  buildOutput,
  writeOutput,
  type SystemTotals,
} from "./monitor.js";

// ── Helpers ─────────────────────────────────────────────────────────

function makeProcess(overrides: Partial<TrackedProcess> = {}): TrackedProcess {
  return {
    pid: 1000,
    ppid: 1,
    comm: "test-proc",
    cmdline: "/usr/bin/test-proc --flag",
    firstSeen: 1000,
    lastSeen: 5000,
    peakRSS: 50000,
    finalRSS: 40000,
    utimeStart: 0,
    utimeEnd: 1000,
    stimeStart: 0,
    stimeEnd: 200,
    ioReadStart: 0,
    ioReadEnd: 4096,
    ioWriteStart: 0,
    ioWriteEnd: 8192,
    voluntaryCtxStart: 0,
    voluntaryCtxEnd: 100,
    involuntaryCtxStart: 0,
    involuntaryCtxEnd: 10,
    pollCount: 5,
    ...overrides,
  };
}

// ── shortName ───────────────────────────────────────────────────────

describe("shortName", () => {
  it("returns comm as the short name", () => {
    const proc = makeProcess({ comm: "node" });
    assert.equal(shortName(proc), "node");
  });

  it("falls back to pid-based name when comm is empty", () => {
    const proc = makeProcess({ comm: "", pid: 42 });
    assert.equal(shortName(proc), "pid-42");
  });
});

// ── shouldInclude ───────────────────────────────────────────────────

describe("shouldInclude", () => {
  it("includes process with enough polls and no ignore match", () => {
    const proc = makeProcess({ pollCount: 5 });
    assert.equal(shouldInclude(proc, 2, []), true);
  });

  it("excludes process with too few polls", () => {
    const proc = makeProcess({ pollCount: 1 });
    assert.equal(shouldInclude(proc, 2, []), false);
  });

  it("excludes process matching ignore-commands in cmdline", () => {
    const proc = makeProcess({ cmdline: "/usr/bin/git status" });
    assert.equal(shouldInclude(proc, 2, ["git"]), false);
  });

  it("excludes process matching ignore-commands in comm", () => {
    const proc = makeProcess({ comm: "git" });
    assert.equal(shouldInclude(proc, 2, ["git"]), false);
  });

  it("does not exclude on empty ignore patterns", () => {
    const proc = makeProcess({ cmdline: "git status" });
    assert.equal(shouldInclude(proc, 2, [""]), true);
  });
});

// ── groupByName ─────────────────────────────────────────────────────

describe("groupByName", () => {
  it("groups processes by short name", () => {
    const procs = [
      makeProcess({ pid: 1, comm: "node" }),
      makeProcess({ pid: 2, comm: "node" }),
      makeProcess({ pid: 3, comm: "bash" }),
    ];
    const groups = groupByName(procs);
    assert.equal(groups.size, 2);
    assert.equal(groups.get("node")?.length, 2);
    assert.equal(groups.get("bash")?.length, 1);
  });

  it("handles empty list", () => {
    const groups = groupByName([]);
    assert.equal(groups.size, 0);
  });
});

// ── buildOutput (pure) ──────────────────────────────────────────────

describe("buildOutput", () => {
  it("returns valid BenchmarkResult without touching disk", () => {
    const tracked = new Map<number, TrackedProcess>();
    tracked.set(1000, makeProcess({ pid: 1000, comm: "go", pollCount: 5 }));

    const system: SystemTotals = {
      cpuUserTotal: 1000,
      cpuSystemTotal: 200,
      cpuTotalTicks: 5000,
      memAvailableMinMB: 8000,
      loadAvg1mMax: 2.5,
      startTime: 1000,
      endTime: 6000,
      pollCount: 20,
    };

    const result = buildOutput(
      { pollIntervalMs: 250, ignoreCommands: [] },
      tracked,
      system,
    );

    assert.ok(Array.isArray(result.benchmarks));
    assert.equal(result.benchmarks.length, 2); // 1 process + 1 system
    assert.equal(result.benchmarks[0].name, "_monitor/process/go");
    assert.equal(result.benchmarks[1].name, "_monitor/system");
    assert.ok(result.context?.monitor);
    assert.equal(result.context?.monitor?.poll_interval_ms, 250);
    assert.equal(result.context?.monitor?.duration_ms, 5000);
  });

  it("aggregates metrics across processes sharing a name", () => {
    const tracked = new Map<number, TrackedProcess>();
    tracked.set(1, makeProcess({ pid: 1, comm: "worker", pollCount: 5, ioReadEnd: 100, ioWriteEnd: 200 }));
    tracked.set(2, makeProcess({ pid: 2, comm: "worker", pollCount: 5, ioReadEnd: 300, ioWriteEnd: 400 }));

    const system: SystemTotals = {
      cpuUserTotal: 0, cpuSystemTotal: 0, cpuTotalTicks: 1,
      memAvailableMinMB: 8000, loadAvg1mMax: 0, startTime: 0, endTime: 1000, pollCount: 5,
    };

    const result = buildOutput({ pollIntervalMs: 100, ignoreCommands: [] }, tracked, system);
    const worker = result.benchmarks.find((b) => b.name === "_monitor/process/worker");
    assert.ok(worker);
    assert.equal(worker.metrics.io_read_bytes.value, 400); // 100 + 300
    assert.equal(worker.metrics.io_write_bytes.value, 600); // 200 + 400
  });
});

// ── writeOutput ─────────────────────────────────────────────────────

describe("writeOutput", () => {
  it("produces valid benchkit-native JSON with _monitor/ prefix", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-test-"));
    const outputPath = path.join(tmpDir, "output.json");

    const config: MonitorConfig = {
      pollIntervalMs: 250,
      outputPath,
      ignoreCommands: [],
      sentinelPath: path.join(tmpDir, "sentinel"),
      statePath: path.join(tmpDir, "state"),
    };

    const tracked = new Map<number, TrackedProcess>();
    tracked.set(
      1000,
      makeProcess({ pid: 1000, comm: "go", pollCount: 5 }),
    );
    tracked.set(
      2000,
      makeProcess({
        pid: 2000,
        comm: "bash",
        pollCount: 3,
        peakRSS: 20000,
        finalRSS: 15000,
        utimeEnd: 500,
        stimeEnd: 100,
      }),
    );

    const system: SystemTotals = {
      cpuUserTotal: 1000,
      cpuSystemTotal: 200,
      cpuTotalTicks: 5000,
      memAvailableMinMB: 8000,
      loadAvg1mMax: 2.5,
      startTime: 1000,
      endTime: 6000,
      pollCount: 20,
    };

    writeOutput(config, tracked, system);

    assert.ok(fs.existsSync(outputPath), "Output file should exist");
    const content = JSON.parse(fs.readFileSync(outputPath, "utf-8"));

    // Should have benchmarks array
    assert.ok(Array.isArray(content.benchmarks));
    // 2 process entries + 1 system entry = 3
    assert.equal(content.benchmarks.length, 3);

    // Process entries have _monitor/process/ prefix
    const processEntries = content.benchmarks.filter((b: { name: string }) =>
      b.name.startsWith("_monitor/process/"),
    );
    assert.equal(processEntries.length, 2);

    // System entry
    const systemEntry = content.benchmarks.find(
      (b: { name: string }) => b.name === "_monitor/system",
    );
    assert.ok(systemEntry);
    assert.equal(systemEntry.metrics.cpu_user_pct.value, 20); // 1000/5000 * 100
    assert.equal(systemEntry.metrics.cpu_system_pct.value, 4); // 200/5000 * 100
    assert.equal(systemEntry.metrics.mem_available_min_mb.value, 8000);
    assert.equal(systemEntry.metrics.load_avg_1m_max.value, 2.5);

    // Context includes monitor metadata
    assert.ok(content.context);
    assert.ok(content.context.monitor);
    assert.equal(content.context.monitor.poll_interval_ms, 250);
    assert.equal(content.context.monitor.duration_ms, 5000);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("filters out short-lived processes", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-test-"));
    const outputPath = path.join(tmpDir, "output.json");

    const config: MonitorConfig = {
      pollIntervalMs: 250,
      outputPath,
      ignoreCommands: [],
      sentinelPath: path.join(tmpDir, "sentinel"),
      statePath: path.join(tmpDir, "state"),
    };

    const tracked = new Map<number, TrackedProcess>();
    tracked.set(
      1000,
      makeProcess({ pid: 1000, comm: "long-running", pollCount: 10 }),
    );
    tracked.set(
      2000,
      makeProcess({ pid: 2000, comm: "ephemeral", pollCount: 1 }),
    );

    const system: SystemTotals = {
      cpuUserTotal: 0,
      cpuSystemTotal: 0,
      cpuTotalTicks: 1,
      memAvailableMinMB: 8000,
      loadAvg1mMax: 0.5,
      startTime: 0,
      endTime: 1000,
      pollCount: 10,
    };

    writeOutput(config, tracked, system);
    const content = JSON.parse(fs.readFileSync(outputPath, "utf-8"));

    // Only long-running + system
    const processEntries = content.benchmarks.filter((b: { name: string }) =>
      b.name.startsWith("_monitor/process/"),
    );
    assert.equal(processEntries.length, 1);
    assert.equal(processEntries[0].name, "_monitor/process/long-running");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("applies ignore-commands filter", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-test-"));
    const outputPath = path.join(tmpDir, "output.json");

    const config: MonitorConfig = {
      pollIntervalMs: 250,
      outputPath,
      ignoreCommands: ["git"],
      sentinelPath: path.join(tmpDir, "sentinel"),
      statePath: path.join(tmpDir, "state"),
    };

    const tracked = new Map<number, TrackedProcess>();
    tracked.set(
      1000,
      makeProcess({
        pid: 1000,
        comm: "git",
        cmdline: "git status",
        pollCount: 5,
      }),
    );
    tracked.set(
      2000,
      makeProcess({ pid: 2000, comm: "node", pollCount: 5 }),
    );

    const system: SystemTotals = {
      cpuUserTotal: 0,
      cpuSystemTotal: 0,
      cpuTotalTicks: 1,
      memAvailableMinMB: 8000,
      loadAvg1mMax: 0.5,
      startTime: 0,
      endTime: 1000,
      pollCount: 10,
    };

    writeOutput(config, tracked, system);
    const content = JSON.parse(fs.readFileSync(outputPath, "utf-8"));

    const processEntries = content.benchmarks.filter((b: { name: string }) =>
      b.name.startsWith("_monitor/process/"),
    );
    assert.equal(processEntries.length, 1);
    assert.equal(processEntries[0].name, "_monitor/process/node");

    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── buildOutput failure paths ────────────────────────────────────────

describe("buildOutput: empty processes", () => {
  it("produces only the system entry when no processes are tracked", () => {
    const tracked = new Map<number, TrackedProcess>();

    const system: SystemTotals = {
      cpuUserTotal: 500,
      cpuSystemTotal: 100,
      cpuTotalTicks: 1000,
      memAvailableMinMB: 4096,
      loadAvg1mMax: 1.2,
      startTime: 0,
      endTime: 3000,
      pollCount: 10,
    };

    const result = buildOutput({ pollIntervalMs: 300, ignoreCommands: [] }, tracked, system);
    assert.equal(result.benchmarks.length, 1);
    assert.equal(result.benchmarks[0].name, "_monitor/system");
  });

  it("computes zero cpu percentages when cpuTotalTicks is zero", () => {
    const tracked = new Map<number, TrackedProcess>();

    const system: SystemTotals = {
      cpuUserTotal: 999,
      cpuSystemTotal: 999,
      cpuTotalTicks: 0,
      memAvailableMinMB: 2048,
      loadAvg1mMax: 0,
      startTime: 0,
      endTime: 1000,
      pollCount: 5,
    };

    const result = buildOutput({ pollIntervalMs: 250, ignoreCommands: [] }, tracked, system);
    const systemEntry = result.benchmarks.find((b) => b.name === "_monitor/system");
    assert.ok(systemEntry);
    assert.equal(systemEntry.metrics.cpu_user_pct.value, 0);
    assert.equal(systemEntry.metrics.cpu_system_pct.value, 0);
  });
});

// ── writeOutput failure paths ────────────────────────────────────────

describe("writeOutput: failure paths", () => {
  it("creates parent directories when they do not exist", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-test-"));
    const nested = path.join(tmpDir, "a", "b", "c", "output.json");

    const config: MonitorConfig = {
      pollIntervalMs: 250,
      outputPath: nested,
      ignoreCommands: [],
      sentinelPath: path.join(tmpDir, "sentinel"),
      statePath: path.join(tmpDir, "state"),
    };

    const system: SystemTotals = {
      cpuUserTotal: 0,
      cpuSystemTotal: 0,
      cpuTotalTicks: 1,
      memAvailableMinMB: 8000,
      loadAvg1mMax: 0,
      startTime: 0,
      endTime: 1000,
      pollCount: 5,
    };

    writeOutput(config, new Map(), system);
    assert.ok(fs.existsSync(nested), "Output file should be created in nested directories");
    fs.rmSync(tmpDir, { recursive: true });
  });
});

// ── Sentinel file lifecycle ─────────────────────────────────────────

describe("sentinel file lifecycle", () => {
  it("writeOutput runs to completion and sentinel is absent by default", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-sentinel-test-"));
    const outputPath = path.join(tmpDir, "output.json");
    const sentinelPath = path.join(tmpDir, ".benchkit-monitor.stop");

    const config: MonitorConfig = {
      pollIntervalMs: 250,
      outputPath,
      ignoreCommands: [],
      sentinelPath,
      statePath: path.join(tmpDir, "state"),
    };

    const system: SystemTotals = {
      cpuUserTotal: 0,
      cpuSystemTotal: 0,
      cpuTotalTicks: 1,
      memAvailableMinMB: 8000,
      loadAvg1mMax: 0,
      startTime: 0,
      endTime: 1000,
      pollCount: 5,
    };

    // Verify sentinel is not present before or after writeOutput
    assert.ok(!fs.existsSync(sentinelPath), "Sentinel should not exist before writeOutput");
    writeOutput(config, new Map(), system);
    assert.ok(!fs.existsSync(sentinelPath), "Sentinel should not be created by writeOutput");
    assert.ok(fs.existsSync(outputPath), "Output file should exist after writeOutput");

    fs.rmSync(tmpDir, { recursive: true });
  });

  it("sentinel file written before writeOutput does not prevent output from being written", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "monitor-sentinel-test-"));
    const outputPath = path.join(tmpDir, "output.json");
    const sentinelPath = path.join(tmpDir, ".benchkit-monitor.stop");

    const config: MonitorConfig = {
      pollIntervalMs: 250,
      outputPath,
      ignoreCommands: [],
      sentinelPath,
      statePath: path.join(tmpDir, "state"),
    };

    const system: SystemTotals = {
      cpuUserTotal: 100,
      cpuSystemTotal: 20,
      cpuTotalTicks: 1000,
      memAvailableMinMB: 4096,
      loadAvg1mMax: 0.5,
      startTime: 0,
      endTime: 2000,
      pollCount: 8,
    };

    // Write sentinel to simulate a stop signal
    fs.writeFileSync(sentinelPath, "stop");

    // writeOutput itself does not check the sentinel; the worker loop does
    writeOutput(config, new Map(), system);
    assert.ok(fs.existsSync(outputPath), "Output should still be written regardless of sentinel");

    // Verify sentinel can be cleaned up
    fs.unlinkSync(sentinelPath);
    assert.ok(!fs.existsSync(sentinelPath), "Sentinel should be gone after cleanup");

    fs.rmSync(tmpDir, { recursive: true });
  });
});
