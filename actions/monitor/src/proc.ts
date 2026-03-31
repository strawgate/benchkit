/**
 * Parsing functions for Linux /proc filesystem entries.
 *
 * Each function accepts raw file content (string) and returns parsed values.
 * All functions are safe: they return undefined or zero-value defaults on
 * parse failures so the monitor never crashes from unexpected /proc format.
 */

import type { ProcessSnapshot, CpuSnapshot, SystemSnapshot } from "./types.js";
import * as fs from "node:fs";

// ── Helpers ──────────────────────────────────────────────────────────

function readFileOr(path: string, fallback: string): string {
  try {
    return fs.readFileSync(path, "utf-8");
  } catch {
    return fallback;
  }
}

function parseKbField(content: string, field: string): number {
  const re = new RegExp(`^${field}:\\s+(\\d+)`, "m");
  const m = content.match(re);
  return m ? parseInt(m[1], 10) : 0;
}

// ── Per-process parsing ─────────────────────────────────────────────

/** Clock ticks per second (USER_HZ), virtually always 100 on Linux. */
const CLK_TCK = 100;

/**
 * Parse /proc/[pid]/stat to extract ppid, utime, stime.
 * Fields (1-indexed): 1=pid, 2=comm, 3=state, 4=ppid, 14=utime, 15=stime.
 * The comm field can contain spaces and parentheses, so we parse around it.
 */
export function parseProcStat(
  content: string,
): { ppid: number; utime: number; stime: number } | undefined {
  // comm is enclosed in parentheses and may contain anything
  const closeParen = content.lastIndexOf(")");
  if (closeParen === -1) return undefined;
  const rest = content.slice(closeParen + 2).split(" ");
  // rest[0]=state, rest[1]=ppid, ... rest[11]=utime, rest[12]=stime
  if (rest.length < 13) return undefined;
  const ppid = parseInt(rest[1], 10);
  const utime = parseInt(rest[11], 10);
  const stime = parseInt(rest[12], 10);
  if (isNaN(ppid) || isNaN(utime) || isNaN(stime)) return undefined;
  return {
    ppid,
    utime: Math.round((utime / CLK_TCK) * 1000),
    stime: Math.round((stime / CLK_TCK) * 1000),
  };
}

/**
 * Parse /proc/[pid]/status to extract VmHWM, VmRSS, context switches.
 */
export function parseProcStatus(
  content: string,
): {
  vmHWM: number;
  vmRSS: number;
  voluntaryCtxSwitches: number;
  involuntaryCtxSwitches: number;
} {
  return {
    vmHWM: parseKbField(content, "VmHWM"),
    vmRSS: parseKbField(content, "VmRSS"),
    voluntaryCtxSwitches: parseKbField(content, "voluntary_ctxt_switches"),
    involuntaryCtxSwitches: parseKbField(content, "nonvoluntary_ctxt_switches"),
  };
}

/**
 * Parse /proc/[pid]/io for read_bytes and write_bytes.
 * These may be unreadable for some processes (permission denied).
 */
export function parseProcIo(
  content: string,
): { readBytes: number; writeBytes: number } {
  const readMatch = content.match(/^read_bytes:\s+(\d+)/m);
  const writeMatch = content.match(/^write_bytes:\s+(\d+)/m);
  return {
    readBytes: readMatch ? parseInt(readMatch[1], 10) : 0,
    writeBytes: writeMatch ? parseInt(writeMatch[1], 10) : 0,
  };
}

/**
 * Parse /proc/[pid]/comm (single line, kernel thread name).
 */
export function parseProcComm(content: string): string {
  return content.trim();
}

/**
 * Parse /proc/[pid]/cmdline (null-separated arguments).
 */
export function parseProcCmdline(content: string): string {
  return content.replace(/\0/g, " ").trim();
}

/**
 * Read a full snapshot of a single process from /proc.
 */
export function readProcessSnapshot(pid: number): ProcessSnapshot | undefined {
  const base = `/proc/${pid}`;
  const statContent = readFileOr(`${base}/stat`, "");
  if (!statContent) return undefined;

  const stat = parseProcStat(statContent);
  if (!stat) return undefined;

  const statusContent = readFileOr(`${base}/status`, "");
  const status = parseProcStatus(statusContent);
  const ioContent = readFileOr(`${base}/io`, "");
  const io = parseProcIo(ioContent);
  const comm = parseProcComm(readFileOr(`${base}/comm`, ""));
  const cmdline = parseProcCmdline(readFileOr(`${base}/cmdline`, ""));

  return {
    pid,
    ppid: stat.ppid,
    comm,
    cmdline: cmdline || comm,
    vmHWM: status.vmHWM,
    vmRSS: status.vmRSS,
    utime: stat.utime,
    stime: stat.stime,
    ioReadBytes: io.readBytes,
    ioWriteBytes: io.writeBytes,
    voluntaryCtxSwitches: status.voluntaryCtxSwitches,
    involuntaryCtxSwitches: status.involuntaryCtxSwitches,
  };
}

// ── System-wide parsing ─────────────────────────────────────────────

/**
 * Parse /proc/stat first cpu line for aggregate CPU counters.
 * Format: cpu  user nice system idle iowait irq softirq steal guest guest_nice
 */
export function parseProcStatCpu(content: string): CpuSnapshot | undefined {
  const line = content.split("\n").find((l) => l.startsWith("cpu "));
  if (!line) return undefined;
  const parts = line.trim().split(/\s+/);
  if (parts.length < 8) return undefined;
  return {
    user: parseInt(parts[1], 10),
    nice: parseInt(parts[2], 10),
    system: parseInt(parts[3], 10),
    idle: parseInt(parts[4], 10),
    iowait: parseInt(parts[5], 10),
    irq: parseInt(parts[6], 10),
    softirq: parseInt(parts[7], 10),
  };
}

/**
 * Parse /proc/meminfo for MemAvailable in MB.
 */
export function parseMeminfo(content: string): number {
  const kb = parseKbField(content, "MemAvailable");
  return Math.round(kb / 1024);
}

/**
 * Parse /proc/loadavg for 1-minute load average.
 */
export function parseLoadavg(content: string): number {
  const parts = content.trim().split(/\s+/);
  return parts.length > 0 ? parseFloat(parts[0]) || 0 : 0;
}

/**
 * Read system-wide snapshot from /proc.
 */
export function readSystemSnapshot(): SystemSnapshot {
  const meminfoContent = readFileOr("/proc/meminfo", "");
  const loadavgContent = readFileOr("/proc/loadavg", "");
  return {
    memAvailableMB: parseMeminfo(meminfoContent),
    loadAvg1m: parseLoadavg(loadavgContent),
  };
}

/**
 * Read the aggregate CPU snapshot from /proc/stat.
 */
export function readCpuSnapshot(): CpuSnapshot | undefined {
  const content = readFileOr("/proc/stat", "");
  return parseProcStatCpu(content);
}

/**
 * List all numeric PID directories in /proc.
 */
export function listPids(): number[] {
  try {
    return fs
      .readdirSync("/proc")
      .filter((d) => /^\d+$/.test(d))
      .map(Number);
  } catch {
    return [];
  }
}
