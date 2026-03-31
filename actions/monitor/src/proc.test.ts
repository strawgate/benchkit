import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseProcStat,
  parseProcStatus,
  parseProcIo,
  parseProcComm,
  parseProcCmdline,
  parseProcStatCpu,
  parseMeminfo,
  parseLoadavg,
} from "./proc.js";

// ── parseProcStat ───────────────────────────────────────────────────

describe("parseProcStat", () => {
  it("parses a typical /proc/[pid]/stat line", () => {
    // pid (comm) state ppid pgrp session tty_nr tpgid flags minflt cminflt majflt cmajflt utime stime ...
    const content =
      "12345 (node) S 1000 12345 12345 0 -1 4194304 1234 0 0 0 500 100 0 0 20 0 1 0 12345678 123456789 1234 18446744073709551615 0 0 0 0 0 0 0 0 0 0 0 0 17 0 0 0 0 0 0";
    const result = parseProcStat(content);
    assert.ok(result);
    assert.equal(result.ppid, 1000);
    // utime=500 ticks at 100 Hz = 5000ms
    assert.equal(result.utime, 5000);
    // stime=100 ticks at 100 Hz = 1000ms
    assert.equal(result.stime, 1000);
  });

  it("handles comm with spaces and parentheses", () => {
    const content =
      "99 (Web Content (pid 42)) S 50 99 99 0 -1 0 0 0 0 0 200 30 0 0 20 0 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 17 0 0 0 0 0 0";
    const result = parseProcStat(content);
    assert.ok(result);
    assert.equal(result.ppid, 50);
    assert.equal(result.utime, 2000);
    assert.equal(result.stime, 300);
  });

  it("returns undefined for empty content", () => {
    assert.equal(parseProcStat(""), undefined);
  });

  it("returns undefined for truncated stat", () => {
    const content = "12345 (node) S 1000";
    assert.equal(parseProcStat(content), undefined);
  });
});

// ── parseProcStatus ─────────────────────────────────────────────────

describe("parseProcStatus", () => {
  it("parses VmHWM, VmRSS, and context switches", () => {
    const content = [
      "Name:\tnode",
      "VmPeak:\t  200000 kB",
      "VmHWM:\t  150000 kB",
      "VmRSS:\t  120000 kB",
      "Threads:\t4",
      "voluntary_ctxt_switches:\t500",
      "nonvoluntary_ctxt_switches:\t25",
    ].join("\n");

    const result = parseProcStatus(content);
    assert.equal(result.vmHWM, 150000);
    assert.equal(result.vmRSS, 120000);
    assert.equal(result.voluntaryCtxSwitches, 500);
    assert.equal(result.involuntaryCtxSwitches, 25);
  });

  it("returns zeros for missing fields", () => {
    const result = parseProcStatus("Name:\ttest\n");
    assert.equal(result.vmHWM, 0);
    assert.equal(result.vmRSS, 0);
    assert.equal(result.voluntaryCtxSwitches, 0);
    assert.equal(result.involuntaryCtxSwitches, 0);
  });
});

// ── parseProcIo ─────────────────────────────────────────────────────

describe("parseProcIo", () => {
  it("parses read_bytes and write_bytes", () => {
    const content = [
      "rchar: 1000",
      "wchar: 2000",
      "syscr: 10",
      "syscw: 20",
      "read_bytes: 4096",
      "write_bytes: 8192",
      "cancelled_write_bytes: 0",
    ].join("\n");

    const result = parseProcIo(content);
    assert.equal(result.readBytes, 4096);
    assert.equal(result.writeBytes, 8192);
  });

  it("returns zeros for empty content", () => {
    const result = parseProcIo("");
    assert.equal(result.readBytes, 0);
    assert.equal(result.writeBytes, 0);
  });
});

// ── parseProcComm ───────────────────────────────────────────────────

describe("parseProcComm", () => {
  it("trims whitespace and newlines", () => {
    assert.equal(parseProcComm("node\n"), "node");
    assert.equal(parseProcComm("  bash  \n"), "bash");
  });

  it("handles empty string", () => {
    assert.equal(parseProcComm(""), "");
  });
});

// ── parseProcCmdline ────────────────────────────────────────────────

describe("parseProcCmdline", () => {
  it("replaces null bytes with spaces", () => {
    assert.equal(
      parseProcCmdline("/usr/bin/node\x00server.js\x00--port\x008080\x00"),
      "/usr/bin/node server.js --port 8080",
    );
  });

  it("handles empty cmdline (kernel thread)", () => {
    assert.equal(parseProcCmdline(""), "");
  });
});

// ── parseProcStatCpu ────────────────────────────────────────────────

describe("parseProcStatCpu", () => {
  it("parses the aggregate cpu line from /proc/stat", () => {
    const content = [
      "cpu  10000 500 3000 80000 200 100 50 0 0 0",
      "cpu0 5000 250 1500 40000 100 50 25 0 0 0",
      "intr 123456",
    ].join("\n");

    const result = parseProcStatCpu(content);
    assert.ok(result);
    assert.equal(result.user, 10000);
    assert.equal(result.nice, 500);
    assert.equal(result.system, 3000);
    assert.equal(result.idle, 80000);
    assert.equal(result.iowait, 200);
    assert.equal(result.irq, 100);
    assert.equal(result.softirq, 50);
  });

  it("returns undefined for missing cpu line", () => {
    assert.equal(parseProcStatCpu("intr 123\n"), undefined);
  });
});

// ── parseMeminfo ────────────────────────────────────────────────────

describe("parseMeminfo", () => {
  it("parses MemAvailable and converts to MB", () => {
    const content = [
      "MemTotal:       16384000 kB",
      "MemFree:         8000000 kB",
      "MemAvailable:   12000000 kB",
      "Buffers:          500000 kB",
    ].join("\n");

    // 12000000 kB / 1024 ≈ 11719 MB
    assert.equal(parseMeminfo(content), 11719);
  });

  it("returns 0 for missing MemAvailable", () => {
    assert.equal(parseMeminfo("MemTotal: 8000 kB\n"), 0);
  });
});

// ── parseLoadavg ────────────────────────────────────────────────────

describe("parseLoadavg", () => {
  it("parses the 1-minute load average", () => {
    assert.equal(parseLoadavg("1.50 0.75 0.25 3/200 12345"), 1.5);
  });

  it("handles zero load", () => {
    assert.equal(parseLoadavg("0.00 0.00 0.00 1/100 1"), 0);
  });

  it("returns 0 for empty content", () => {
    assert.equal(parseLoadavg(""), 0);
  });
});
