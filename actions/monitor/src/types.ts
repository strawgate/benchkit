/** Types for the monitor action. */

export interface ProcessSnapshot {
  pid: number;
  ppid: number;
  comm: string;
  cmdline: string;
  vmHWM: number;
  vmRSS: number;
  utime: number;
  stime: number;
  ioReadBytes: number;
  ioWriteBytes: number;
  voluntaryCtxSwitches: number;
  involuntaryCtxSwitches: number;
}

export interface TrackedProcess {
  pid: number;
  ppid: number;
  comm: string;
  cmdline: string;
  firstSeen: number;
  lastSeen: number;
  peakRSS: number;
  finalRSS: number;
  utimeStart: number;
  utimeEnd: number;
  stimeStart: number;
  stimeEnd: number;
  ioReadStart: number;
  ioReadEnd: number;
  ioWriteStart: number;
  ioWriteEnd: number;
  voluntaryCtxStart: number;
  voluntaryCtxEnd: number;
  involuntaryCtxStart: number;
  involuntaryCtxEnd: number;
  pollCount: number;
}

export interface CpuSnapshot {
  user: number;
  nice: number;
  system: number;
  idle: number;
  iowait: number;
  irq: number;
  softirq: number;
}

export interface SystemSnapshot {
  memAvailableMB: number;
  loadAvg1m: number;
}

export interface MonitorConfig {
  pollIntervalMs: number;
  outputPath: string;
  ignoreCommands: string[];
  sentinelPath: string;
  statePath: string;
}

export interface MonitorState {
  pid: number;
  outputPath: string;
  sentinelPath: string;
  startTime: number;
}
