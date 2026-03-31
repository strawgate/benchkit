/**
 * Monitor utility functions.
 *
 * Exported helpers for process tracking, filtering, grouping, and
 * output generation. The background poll loop lives in monitor-worker.ts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  MonitorConfig,
  TrackedProcess,
} from "./types.js";
import type { BenchmarkResult } from "@benchkit/format";

// ── Output generation ───────────────────────────────────────────────

export interface SystemTotals {
  cpuUserTotal: number;
  cpuSystemTotal: number;
  cpuTotalTicks: number;
  memAvailableMinMB: number;
  loadAvg1mMax: number;
  startTime: number;
  endTime: number;
  pollCount: number;
}

export function shortName(proc: TrackedProcess): string {
  // Use comm as the short name; deduplicate with PID if needed
  return proc.comm || `pid-${proc.pid}`;
}

export function shouldInclude(
  proc: TrackedProcess,
  minPolls: number,
  ignoreCommands: string[],
): boolean {
  if (proc.pollCount < minPolls) return false;
  for (const pattern of ignoreCommands) {
    if (pattern && proc.cmdline.includes(pattern)) return false;
    if (pattern && proc.comm.includes(pattern)) return false;
  }
  return true;
}

/**
 * Group processes by their short name, picking the most representative
 * (highest peak RSS) when multiple processes share a name.
 */
export function groupByName(
  processes: TrackedProcess[],
): Map<string, TrackedProcess[]> {
  const groups = new Map<string, TrackedProcess[]>();
  for (const proc of processes) {
    const name = shortName(proc);
    const existing = groups.get(name);
    if (existing) {
      existing.push(proc);
    } else {
      groups.set(name, [proc]);
    }
  }
  return groups;
}

export function buildOutput(
  cfg: Pick<MonitorConfig, "pollIntervalMs" | "ignoreCommands">,
  tracked: Map<number, TrackedProcess>,
  system: SystemTotals,
): BenchmarkResult {
  const minPolls = 2;
  const processes = Array.from(tracked.values()).filter((p) =>
    shouldInclude(p, minPolls, cfg.ignoreCommands),
  );

  const benchmarks: BenchmarkResult["benchmarks"] = [];

  // Per-process metrics (grouped by name, aggregated)
  const groups = groupByName(processes);
  for (const [name, procs] of groups) {
    let peakRSS = 0;
    let finalRSS = 0;
    let cpuUser = 0;
    let cpuSystem = 0;
    let wallClock = 0;
    let ioRead = 0;
    let ioWrite = 0;
    let volCtx = 0;
    let involCtx = 0;

    for (const p of procs) {
      peakRSS = Math.max(peakRSS, p.peakRSS);
      finalRSS += p.finalRSS;
      cpuUser += p.utimeEnd - p.utimeStart;
      cpuSystem += p.stimeEnd - p.stimeStart;
      wallClock = Math.max(wallClock, p.lastSeen - p.firstSeen);
      ioRead += p.ioReadEnd - p.ioReadStart;
      ioWrite += p.ioWriteEnd - p.ioWriteStart;
      volCtx += p.voluntaryCtxEnd - p.voluntaryCtxStart;
      involCtx += p.involuntaryCtxEnd - p.involuntaryCtxStart;
    }

    benchmarks.push({
      name: `_monitor/process/${name}`,
      metrics: {
        peak_rss_kb: {
          value: peakRSS,
          unit: "KB",
          direction: "smaller_is_better",
        },
        final_rss_kb: {
          value: finalRSS,
          unit: "KB",
          direction: "smaller_is_better",
        },
        cpu_user_ms: {
          value: cpuUser,
          unit: "ms",
          direction: "smaller_is_better",
        },
        cpu_system_ms: {
          value: cpuSystem,
          unit: "ms",
          direction: "smaller_is_better",
        },
        wall_clock_ms: {
          value: wallClock,
          unit: "ms",
          direction: "smaller_is_better",
        },
        io_read_bytes: { value: ioRead, unit: "bytes" },
        io_write_bytes: { value: ioWrite, unit: "bytes" },
        voluntary_ctx_switches: {
          value: volCtx,
          unit: "count",
          direction: "smaller_is_better",
        },
        involuntary_ctx_switches: {
          value: involCtx,
          unit: "count",
          direction: "smaller_is_better",
        },
      },
    });
  }

  // System-wide metrics
  const cpuUserPct =
    system.cpuTotalTicks > 0
      ? Math.round((system.cpuUserTotal / system.cpuTotalTicks) * 10000) / 100
      : 0;
  const cpuSystemPct =
    system.cpuTotalTicks > 0
      ? Math.round(
          (system.cpuSystemTotal / system.cpuTotalTicks) * 10000,
        ) / 100
      : 0;

  benchmarks.push({
    name: "_monitor/system",
    metrics: {
      cpu_user_pct: { value: cpuUserPct, unit: "%" },
      cpu_system_pct: { value: cpuSystemPct, unit: "%" },
      mem_available_min_mb: {
        value: system.memAvailableMinMB,
        unit: "MB",
        direction: "smaller_is_better",
      },
      load_avg_1m_max: { value: system.loadAvg1mMax, unit: "load" },
    },
  });

  return {
    benchmarks,
    context: {
      timestamp: new Date().toISOString(),
      monitor: {
        monitor_version: "0.1.0",
        poll_interval_ms: cfg.pollIntervalMs,
        duration_ms: system.endTime - system.startTime,
        poll_count: system.pollCount,
        runner_os: process.env.RUNNER_OS || undefined,
        runner_arch: process.env.RUNNER_ARCH || undefined,
      },
    },
  };
}

export function writeOutput(
  cfg: MonitorConfig,
  tracked: Map<number, TrackedProcess>,
  system: SystemTotals,
): void {
  const output = buildOutput(cfg, tracked, system);
  const dir = path.dirname(cfg.outputPath);
  if (dir && dir !== ".") {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(cfg.outputPath, JSON.stringify(output, null, 2) + "\n");
}

