/**
 * Background monitor worker process.
 *
 * Spawned as a detached child process by main.ts.
 * Polls /proc at a configurable interval, tracks per-process and
 * system-wide metrics, and writes benchkit-native JSON output when
 * it detects the sentinel stop file.
 */

import * as fs from "node:fs";
import type {
  MonitorConfig,
  TrackedProcess,
  CpuSnapshot,
} from "./types.js";
import {
  listPids,
  readProcessSnapshot,
  readSystemSnapshot,
  readCpuSnapshot,
} from "./proc.js";
import { writeOutput } from "./monitor.js";

// ── Entry point ─────────────────────────────────────────────────────

const configJson = process.argv[2];
if (!configJson) {
  process.stderr.write("monitor: missing config argument\n");
  process.exit(1);
}

const config: MonitorConfig = JSON.parse(configJson);
runMonitor(config);

// ── Main loop ───────────────────────────────────────────────────────

function runMonitor(cfg: MonitorConfig): void {
  const tracked = new Map<number, TrackedProcess>();
  const baselinePids = new Set(listPids());

  let cpuPrev: CpuSnapshot | undefined = readCpuSnapshot();
  let cpuUserTotal = 0;
  let cpuSystemTotal = 0;
  let cpuTotalTicks = 0;
  let memAvailableMinMB = Infinity;
  let loadAvg1mMax = 0;
  const startTime = Date.now();
  let pollCount = 0;

  const poll = (): void => {
    pollCount++;
    const now = Date.now();
    const pids = listPids();

    // Per-process tracking
    for (const pid of pids) {
      if (baselinePids.has(pid)) continue;

      const snap = readProcessSnapshot(pid);
      if (!snap) continue;

      const existing = tracked.get(pid);
      if (existing) {
        existing.lastSeen = now;
        existing.peakRSS = Math.max(existing.peakRSS, snap.vmHWM);
        existing.finalRSS = snap.vmRSS;
        existing.utimeEnd = snap.utime;
        existing.stimeEnd = snap.stime;
        existing.ioReadEnd = snap.ioReadBytes;
        existing.ioWriteEnd = snap.ioWriteBytes;
        existing.voluntaryCtxEnd = snap.voluntaryCtxSwitches;
        existing.involuntaryCtxEnd = snap.involuntaryCtxSwitches;
        existing.pollCount++;
      } else {
        tracked.set(pid, {
          pid,
          ppid: snap.ppid,
          comm: snap.comm,
          cmdline: snap.cmdline,
          firstSeen: now,
          lastSeen: now,
          peakRSS: snap.vmHWM,
          finalRSS: snap.vmRSS,
          utimeStart: snap.utime,
          utimeEnd: snap.utime,
          stimeStart: snap.stime,
          stimeEnd: snap.stime,
          ioReadStart: snap.ioReadBytes,
          ioReadEnd: snap.ioReadBytes,
          ioWriteStart: snap.ioWriteBytes,
          ioWriteEnd: snap.ioWriteBytes,
          voluntaryCtxStart: snap.voluntaryCtxSwitches,
          voluntaryCtxEnd: snap.voluntaryCtxSwitches,
          involuntaryCtxStart: snap.involuntaryCtxSwitches,
          involuntaryCtxEnd: snap.involuntaryCtxSwitches,
          pollCount: 1,
        });
      }
    }

    // System-wide metrics
    const sys = readSystemSnapshot();
    if (sys.memAvailableMB > 0 && sys.memAvailableMB < memAvailableMinMB) {
      memAvailableMinMB = sys.memAvailableMB;
    }
    if (sys.loadAvg1m > loadAvg1mMax) {
      loadAvg1mMax = sys.loadAvg1m;
    }

    // CPU percentage via delta
    const cpuNow = readCpuSnapshot();
    if (cpuPrev && cpuNow) {
      const dUser = cpuNow.user + cpuNow.nice - cpuPrev.user - cpuPrev.nice;
      const dSystem =
        cpuNow.system +
        cpuNow.irq +
        cpuNow.softirq -
        cpuPrev.system -
        cpuPrev.irq -
        cpuPrev.softirq;
      const dIdle =
        cpuNow.idle + cpuNow.iowait - cpuPrev.idle - cpuPrev.iowait;
      const dTotal = dUser + dSystem + dIdle;
      if (dTotal > 0) {
        cpuUserTotal += dUser;
        cpuSystemTotal += dSystem;
        cpuTotalTicks += dTotal;
      }
    }
    cpuPrev = cpuNow;

    // Check sentinel
    if (fs.existsSync(cfg.sentinelPath)) {
      clearInterval(timer);
      writeOutput(cfg, tracked, {
        cpuUserTotal,
        cpuSystemTotal,
        cpuTotalTicks,
        memAvailableMinMB:
          memAvailableMinMB === Infinity ? 0 : memAvailableMinMB,
        loadAvg1mMax,
        startTime,
        endTime: Date.now(),
        pollCount,
      });
      process.exit(0);
    }
  };

  const timer = setInterval(poll, cfg.pollIntervalMs);

  // Safety: also exit on SIGTERM
  process.on("SIGTERM", () => {
    clearInterval(timer);
    writeOutput(cfg, tracked, {
      cpuUserTotal,
      cpuSystemTotal,
      cpuTotalTicks,
      memAvailableMinMB:
        memAvailableMinMB === Infinity ? 0 : memAvailableMinMB,
      loadAvg1mMax,
      startTime,
      endTime: Date.now(),
      pollCount,
    });
    process.exit(0);
  });
}
