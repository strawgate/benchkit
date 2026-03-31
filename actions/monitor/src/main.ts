import * as core from "@actions/core";
import * as fs from "node:fs";
import * as path from "node:path";
import { fork } from "node:child_process";
import type { MonitorConfig, MonitorState } from "./types.js";

const SENTINEL_NAME = ".benchkit-monitor.stop";
const STATE_NAME = ".benchkit-monitor.state.json";

function runnerTemp(): string {
  return process.env.RUNNER_TEMP || "/tmp";
}

async function run(): Promise<void> {
  const mode = core.getInput("mode", { required: true });

  // Platform check: Linux only
  if (process.platform !== "linux") {
    core.warning(
      `Benchkit Monitor only supports Linux. Current platform: ${process.platform}. Skipping.`,
    );
    return;
  }

  if (mode === "start") {
    await startMonitor();
  } else if (mode === "stop") {
    await stopMonitor();
  } else {
    throw new Error(`Unknown mode: ${mode}. Expected 'start' or 'stop'.`);
  }
}

async function startMonitor(): Promise<void> {
  const pollInterval = parseInt(core.getInput("poll-interval") || "250", 10);
  const output = core.getInput("output") || "monitor.json";
  const ignoreCommandsRaw = core.getInput("ignore-commands") || "";
  const ignoreCommands = ignoreCommandsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const sentinelPath = path.join(runnerTemp(), SENTINEL_NAME);
  const statePath = path.join(runnerTemp(), STATE_NAME);
  const outputPath = path.resolve(output);

  // Clean up any leftover sentinel/state from previous runs
  try {
    fs.unlinkSync(sentinelPath);
  } catch {
    /* no-op */
  }
  try {
    fs.unlinkSync(statePath);
  } catch {
    /* no-op */
  }

  const config: MonitorConfig = {
    pollIntervalMs: pollInterval,
    outputPath,
    ignoreCommands,
    sentinelPath,
    statePath,
  };

  // Fork the monitor process
  const monitorScript = path.join(__dirname, "monitor-worker.js");
  const child = fork(monitorScript, [JSON.stringify(config)], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  if (!child.pid) {
    throw new Error("Failed to fork monitor process");
  }

  // Write state file so stop can find the process
  const state: MonitorState = {
    pid: child.pid,
    outputPath,
    sentinelPath,
    startTime: Date.now(),
  };
  fs.writeFileSync(statePath, JSON.stringify(state));

  core.info(
    `Monitor started (PID ${child.pid}, poll interval ${pollInterval}ms)`,
  );
  core.info(`Output will be written to: ${outputPath}`);
}

async function stopMonitor(): Promise<void> {
  const statePath = path.join(runnerTemp(), STATE_NAME);

  if (!fs.existsSync(statePath)) {
    core.warning(
      "No monitor state file found. Was the monitor started in a previous step?",
    );
    return;
  }

  const state: MonitorState = JSON.parse(
    fs.readFileSync(statePath, "utf-8"),
  );

  // Write sentinel file to signal the monitor to stop
  fs.writeFileSync(state.sentinelPath, "stop");
  core.info("Sentinel file written, waiting for monitor to exit...");

  // Wait for the monitor process to exit (up to 10 seconds)
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!isProcessRunning(state.pid)) break;
    await sleep(100);
  }

  // If still running, send SIGTERM
  if (isProcessRunning(state.pid)) {
    core.warning("Monitor did not exit cleanly, sending SIGTERM");
    try {
      process.kill(state.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
    // Wait a bit more
    const termDeadline = Date.now() + 5_000;
    while (Date.now() < termDeadline) {
      if (!isProcessRunning(state.pid)) break;
      await sleep(100);
    }
  }

  // Check output
  if (fs.existsSync(state.outputPath)) {
    core.info(`Monitor output written to: ${state.outputPath}`);
    core.setOutput("output-file", state.outputPath);
  } else {
    core.warning("Monitor exited but no output file was produced.");
  }

  // Clean up
  try {
    fs.unlinkSync(state.sentinelPath);
  } catch {
    /* no-op */
  }
  try {
    fs.unlinkSync(statePath);
  } catch {
    /* no-op */
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

run().catch((err) => {
  core.setFailed(err instanceof Error ? err.message : String(err));
});
