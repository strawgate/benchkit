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
import type { SystemTotals } from "./monitor.js";
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

// ── State ───────────────────────────────────────────────────────────

interface MonitorState {
  tracked: Map<number, TrackedProcess>;
  baselinePids: Set<number>;
  cpuPrev: CpuSnapshot | undefined;
  cpuUserTotal: number;
  cpuSystemTotal: number;
  cpuTotalTicks: number;
  memAvailableMinMB: number;
  loadAvg1mMax: number;
  startTime: number;
  pollCount: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

function initState(): MonitorState {
  return {
    tracked: new Map(),
    baselinePids: new Set(listPids()),
    cpuPrev: readCpuSnapshot(),
    cpuUserTotal: 0,
    cpuSystemTotal: 0,
    cpuTotalTicks: 0,
    memAvailableMinMB: Infinity,
    loadAvg1mMax: 0,
    startTime: Date.now(),
    pollCount: 0,
  };
}

function initTrackedProcess(pid: number, snap: ReturnType<typeof readProcessSnapshot> & object, now: number): TrackedProcess {
  return {
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
  };
}

function trackProcesses(state: MonitorState): void {
  const now = Date.now();
  const pids = listPids();

  for (const pid of pids) {
    if (state.baselinePids.has(pid)) continue;

    const snap = readProcessSnapshot(pid);
    if (!snap) continue;

    const existing = state.tracked.get(pid);
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
      state.tracked.set(pid, initTrackedProcess(pid, snap, now));
    }
  }
}

function updateSystemMetrics(state: MonitorState): void {
  const sys = readSystemSnapshot();
  if (sys.memAvailableMB > 0 && sys.memAvailableMB < state.memAvailableMinMB) {
    state.memAvailableMinMB = sys.memAvailableMB;
  }
  if (sys.loadAvg1m > state.loadAvg1mMax) {
    state.loadAvg1mMax = sys.loadAvg1m;
  }

  const cpuNow = readCpuSnapshot();
  if (state.cpuPrev && cpuNow) {
    const dUser = cpuNow.user + cpuNow.nice - state.cpuPrev.user - state.cpuPrev.nice;
    const dSystem =
      cpuNow.system + cpuNow.irq + cpuNow.softirq -
      state.cpuPrev.system - state.cpuPrev.irq - state.cpuPrev.softirq;
    const dIdle = cpuNow.idle + cpuNow.iowait - state.cpuPrev.idle - state.cpuPrev.iowait;
    const dTotal = dUser + dSystem + dIdle;
    if (dTotal > 0) {
      state.cpuUserTotal += dUser;
      state.cpuSystemTotal += dSystem;
      state.cpuTotalTicks += dTotal;
    }
  }
  state.cpuPrev = cpuNow;
}

function collectSystemTotals(state: MonitorState): SystemTotals {
  return {
    cpuUserTotal: state.cpuUserTotal,
    cpuSystemTotal: state.cpuSystemTotal,
    cpuTotalTicks: state.cpuTotalTicks,
    memAvailableMinMB: state.memAvailableMinMB === Infinity ? 0 : state.memAvailableMinMB,
    loadAvg1mMax: state.loadAvg1mMax,
    startTime: state.startTime,
    endTime: Date.now(),
    pollCount: state.pollCount,
  };
}

function finalize(cfg: MonitorConfig, state: MonitorState): void {
  try {
    writeOutput(cfg, state.tracked, collectSystemTotals(state));
  } catch (err) {
    process.stderr.write(`monitor: failed to write output: ${err}\n`);
  }
}

// ── Main loop ───────────────────────────────────────────────────────

function runMonitor(cfg: MonitorConfig): void {
  const state = initState();

  const poll = (): void => {
    state.pollCount++;
    trackProcesses(state);
    updateSystemMetrics(state);

    if (fs.existsSync(cfg.sentinelPath)) {
      clearInterval(timer);
      finalize(cfg, state);
      process.exit(0);
    }
  };

  const timer = setInterval(poll, cfg.pollIntervalMs);

  process.on("SIGTERM", () => {
    clearInterval(timer);
    finalize(cfg, state);
    process.exit(0);
  });
}
