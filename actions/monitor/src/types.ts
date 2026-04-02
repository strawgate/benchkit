/** Types for the monitor action. */

/** State persisted between main and post steps via core.saveState. */
export interface OtelState {
  pid: number;
  configPath: string;
  outputPath: string;
  startTime: number;
  runId: string;
  dataBranch: string;
  /** PIDs that existed before the collector started (Linux only). */
  baselinePids?: number[];
}
