/**
 * OTel Collector stop and push logic.
 *
 * Runs as the action post step. Sends SIGTERM to the collector,
 * waits for it to flush, then pushes the raw OTLP JSONL file
 * to the data branch.
 */

import * as core from "@actions/core";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import type { OtelState } from "./types.js";

export function isProcessRunning(pid: number): boolean {
  if (pid <= 0) return false;
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

export function safeUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

export async function stopCollector(state: OtelState): Promise<void> {
  if (!isProcessRunning(state.pid)) {
    core.info("Collector process already exited.");
    return;
  }

  core.info(`Sending SIGTERM to collector (PID ${state.pid})...`);
  try {
    process.kill(state.pid, "SIGTERM");
  } catch {
    core.info("Collector already gone.");
    return;
  }

  // Wait up to 10s for graceful shutdown (flushes pending data)
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (!isProcessRunning(state.pid)) {
      core.info("Collector exited cleanly.");
      return;
    }
    await sleep(200);
  }

  // Force kill if still running
  core.warning("Collector did not exit in time, sending SIGKILL.");
  try {
    process.kill(state.pid, "SIGKILL");
  } catch {
    // already gone
  }
}

function git(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
  }).trim();
}

function pushTelemetryToDataBranch(state: OtelState): void {
  if (!fs.existsSync(state.outputPath)) {
    core.warning("No telemetry output file found — nothing to push.");
    return;
  }

  const stats = fs.statSync(state.outputPath);
  if (stats.size === 0) {
    core.warning("Telemetry output file is empty — nothing to push.");
    return;
  }

  core.info(
    `Telemetry file: ${state.outputPath} (${(stats.size / 1024).toFixed(1)} KB)`,
  );

  const token = core.getInput("github-token") || process.env.GITHUB_TOKEN;
  if (!token) {
    core.warning("No github-token provided — skipping data branch push.");
    return;
  }

  const workspace = process.env.GITHUB_WORKSPACE;
  if (!workspace) {
    core.warning("GITHUB_WORKSPACE not set — skipping data branch push.");
    return;
  }

  const serverUrl = process.env.GITHUB_SERVER_URL || "https://github.com";

  // Use a temporary worktree to commit to the data branch without
  // disturbing the main checkout.
  const worktreePath = path.join(
    process.env.RUNNER_TEMP || "/tmp",
    "benchkit-data-worktree",
  );

  // Clean up any leftover worktree from a previous run
  if (fs.existsSync(worktreePath)) {
    try {
      git(["worktree", "remove", "--force", worktreePath], workspace);
    } catch {
      fs.rmSync(worktreePath, { recursive: true, force: true });
    }
  }

  try {
    // Configure git auth
    git(
      ["config", "--local", `http.${serverUrl}/.extraheader`,
       `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`],
      workspace,
    );

    // Fetch the data branch (or create it as an orphan)
    let branchExists = false;
    try {
      git(["fetch", "origin", state.dataBranch, "--depth=1"], workspace);
      branchExists = true;
    } catch {
      // branch does not exist yet
    }

    if (branchExists) {
      git(
        ["worktree", "add", worktreePath, `origin/${state.dataBranch}`],
        workspace,
      );
      // Detach from remote tracking and create local branch
      git(["checkout", "-B", state.dataBranch], worktreePath);
    } else {
      git(["worktree", "add", "--detach", worktreePath], workspace);
      git(["checkout", "--orphan", state.dataBranch], worktreePath);
      git(["rm", "-rf", "."], worktreePath);
    }

    // Write telemetry file
    const telemetryDir = path.join(worktreePath, "data", "telemetry");
    fs.mkdirSync(telemetryDir, { recursive: true });
    const targetPath = path.join(telemetryDir, `${state.runId}.otlp.json`);
    fs.copyFileSync(state.outputPath, targetPath);

    // Commit and push
    git(["add", targetPath], worktreePath);

    // Check if there are changes to commit
    try {
      git(["diff", "--cached", "--quiet"], worktreePath);
      core.info("No changes to commit.");
      return;
    } catch {
      // diff --quiet exits non-zero if there are staged changes — good
    }

    git(
      [
        "-c", "user.name=benchkit[bot]",
        "-c", "user.email=benchkit[bot]@users.noreply.github.com",
        "commit", "-m", `telemetry: store run ${state.runId}`,
      ],
      worktreePath,
    );
    git(["push", "origin", state.dataBranch], worktreePath);
    core.info(`Telemetry pushed to ${state.dataBranch} for run ${state.runId}`);
  } finally {
    // Clean up worktree
    try {
      git(["worktree", "remove", "--force", worktreePath], workspace);
    } catch {
      // best effort
    }
  }
}

export async function stopOtelCollector(): Promise<void> {
  const statePath = core.getState("otel-state-path");
  if (!statePath || !fs.existsSync(statePath)) {
    core.info("No OTel Collector state found — was the monitor started?");
    return;
  }

  const state: OtelState = JSON.parse(fs.readFileSync(statePath, "utf-8"));

  await stopCollector(state);
  pushTelemetryToDataBranch(state);

  // Clean up temp files
  safeUnlink(statePath);
  safeUnlink(state.configPath);
  // Keep the OTLP output file in case other steps want to read it
}
