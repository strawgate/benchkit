require('./sourcemap-register.js');/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 76:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


/**
 * Background monitor worker process.
 *
 * Spawned as a detached child process by main.ts.
 * Polls /proc at a configurable interval, tracks per-process and
 * system-wide metrics, and writes benchkit-native JSON output when
 * it detects the sentinel stop file.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
const fs = __importStar(__nccwpck_require__(24));
const proc_js_1 = __nccwpck_require__(211);
const monitor_js_1 = __nccwpck_require__(469);
// ── Entry point ─────────────────────────────────────────────────────
const configJson = process.argv[2];
if (!configJson) {
    process.stderr.write("monitor: missing config argument\n");
    process.exit(1);
}
const config = JSON.parse(configJson);
runMonitor(config);
// ── Main loop ───────────────────────────────────────────────────────
function runMonitor(cfg) {
    const tracked = new Map();
    const baselinePids = new Set((0, proc_js_1.listPids)());
    let cpuPrev = (0, proc_js_1.readCpuSnapshot)();
    let cpuUserTotal = 0;
    let cpuSystemTotal = 0;
    let cpuTotalTicks = 0;
    let memAvailableMinMB = Infinity;
    let loadAvg1mMax = 0;
    const startTime = Date.now();
    let pollCount = 0;
    const poll = () => {
        pollCount++;
        const now = Date.now();
        const pids = (0, proc_js_1.listPids)();
        // Per-process tracking
        for (const pid of pids) {
            if (baselinePids.has(pid))
                continue;
            const snap = (0, proc_js_1.readProcessSnapshot)(pid);
            if (!snap)
                continue;
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
            }
            else {
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
        const sys = (0, proc_js_1.readSystemSnapshot)();
        if (sys.memAvailableMB > 0 && sys.memAvailableMB < memAvailableMinMB) {
            memAvailableMinMB = sys.memAvailableMB;
        }
        if (sys.loadAvg1m > loadAvg1mMax) {
            loadAvg1mMax = sys.loadAvg1m;
        }
        // CPU percentage via delta
        const cpuNow = (0, proc_js_1.readCpuSnapshot)();
        if (cpuPrev && cpuNow) {
            const dUser = cpuNow.user + cpuNow.nice - cpuPrev.user - cpuPrev.nice;
            const dSystem = cpuNow.system +
                cpuNow.irq +
                cpuNow.softirq -
                cpuPrev.system -
                cpuPrev.irq -
                cpuPrev.softirq;
            const dIdle = cpuNow.idle + cpuNow.iowait - cpuPrev.idle - cpuPrev.iowait;
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
            (0, monitor_js_1.writeOutput)(cfg, tracked, {
                cpuUserTotal,
                cpuSystemTotal,
                cpuTotalTicks,
                memAvailableMinMB: memAvailableMinMB === Infinity ? 0 : memAvailableMinMB,
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
        (0, monitor_js_1.writeOutput)(cfg, tracked, {
            cpuUserTotal,
            cpuSystemTotal,
            cpuTotalTicks,
            memAvailableMinMB: memAvailableMinMB === Infinity ? 0 : memAvailableMinMB,
            loadAvg1mMax,
            startTime,
            endTime: Date.now(),
            pollCount,
        });
        process.exit(0);
    });
}
//# sourceMappingURL=monitor-worker.js.map

/***/ }),

/***/ 469:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


/**
 * Monitor utility functions.
 *
 * Exported helpers for process tracking, filtering, grouping, and
 * output generation. The background poll loop lives in monitor-worker.ts.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.shortName = shortName;
exports.shouldInclude = shouldInclude;
exports.groupByName = groupByName;
exports.writeOutput = writeOutput;
const fs = __importStar(__nccwpck_require__(24));
const path = __importStar(__nccwpck_require__(760));
function shortName(proc) {
    // Use comm as the short name; deduplicate with PID if needed
    return proc.comm || `pid-${proc.pid}`;
}
function shouldInclude(proc, minPolls, ignoreCommands) {
    if (proc.pollCount < minPolls)
        return false;
    for (const pattern of ignoreCommands) {
        if (pattern && proc.cmdline.includes(pattern))
            return false;
        if (pattern && proc.comm.includes(pattern))
            return false;
    }
    return true;
}
/**
 * Group processes by their short name, picking the most representative
 * (highest peak RSS) when multiple processes share a name.
 */
function groupByName(processes) {
    const groups = new Map();
    for (const proc of processes) {
        const name = shortName(proc);
        const existing = groups.get(name);
        if (existing) {
            existing.push(proc);
        }
        else {
            groups.set(name, [proc]);
        }
    }
    return groups;
}
function writeOutput(cfg, tracked, system) {
    const minPolls = 2;
    const processes = Array.from(tracked.values()).filter((p) => shouldInclude(p, minPolls, cfg.ignoreCommands));
    const benchmarks = [];
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
    const cpuUserPct = system.cpuTotalTicks > 0
        ? Math.round((system.cpuUserTotal / system.cpuTotalTicks) * 10000) / 100
        : 0;
    const cpuSystemPct = system.cpuTotalTicks > 0
        ? Math.round((system.cpuSystemTotal / system.cpuTotalTicks) * 10000) / 100
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
    const output = {
        benchmarks,
        context: {
            timestamp: new Date().toISOString(),
            runner: process.env.RUNNER_OS
                ? `${process.env.RUNNER_OS}/${process.env.RUNNER_ARCH}`
                : undefined,
            monitor: {
                monitor_version: "0.1.0",
                poll_interval_ms: cfg.pollIntervalMs,
                duration_ms: system.endTime - system.startTime,
                poll_count: system.pollCount,
            },
        },
    };
    const dir = path.dirname(cfg.outputPath);
    if (dir && dir !== ".") {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(cfg.outputPath, JSON.stringify(output, null, 2) + "\n");
}
//# sourceMappingURL=monitor.js.map

/***/ }),

/***/ 211:
/***/ (function(__unused_webpack_module, exports, __nccwpck_require__) {


/**
 * Parsing functions for Linux /proc filesystem entries.
 *
 * Each function accepts raw file content (string) and returns parsed values.
 * All functions are safe: they return undefined or zero-value defaults on
 * parse failures so the monitor never crashes from unexpected /proc format.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.parseProcStat = parseProcStat;
exports.parseProcStatus = parseProcStatus;
exports.parseProcIo = parseProcIo;
exports.parseProcComm = parseProcComm;
exports.parseProcCmdline = parseProcCmdline;
exports.readProcessSnapshot = readProcessSnapshot;
exports.parseProcStatCpu = parseProcStatCpu;
exports.parseMeminfo = parseMeminfo;
exports.parseLoadavg = parseLoadavg;
exports.readSystemSnapshot = readSystemSnapshot;
exports.readCpuSnapshot = readCpuSnapshot;
exports.listPids = listPids;
const fs = __importStar(__nccwpck_require__(24));
// ── Helpers ──────────────────────────────────────────────────────────
function readFileOr(path, fallback) {
    try {
        return fs.readFileSync(path, "utf-8");
    }
    catch {
        return fallback;
    }
}
function parseKbField(content, field) {
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
function parseProcStat(content) {
    // comm is enclosed in parentheses and may contain anything
    const closeParen = content.lastIndexOf(")");
    if (closeParen === -1)
        return undefined;
    const rest = content.slice(closeParen + 2).split(" ");
    // rest[0]=state, rest[1]=ppid, ... rest[11]=utime, rest[12]=stime
    if (rest.length < 13)
        return undefined;
    const ppid = parseInt(rest[1], 10);
    const utime = parseInt(rest[11], 10);
    const stime = parseInt(rest[12], 10);
    if (isNaN(ppid) || isNaN(utime) || isNaN(stime))
        return undefined;
    return {
        ppid,
        utime: Math.round((utime / CLK_TCK) * 1000),
        stime: Math.round((stime / CLK_TCK) * 1000),
    };
}
/**
 * Parse /proc/[pid]/status to extract VmHWM, VmRSS, context switches.
 */
function parseProcStatus(content) {
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
function parseProcIo(content) {
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
function parseProcComm(content) {
    return content.trim();
}
/**
 * Parse /proc/[pid]/cmdline (null-separated arguments).
 */
function parseProcCmdline(content) {
    return content.replace(/\0/g, " ").trim();
}
/**
 * Read a full snapshot of a single process from /proc.
 */
function readProcessSnapshot(pid) {
    const base = `/proc/${pid}`;
    const statContent = readFileOr(`${base}/stat`, "");
    if (!statContent)
        return undefined;
    const stat = parseProcStat(statContent);
    if (!stat)
        return undefined;
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
function parseProcStatCpu(content) {
    const line = content.split("\n").find((l) => l.startsWith("cpu "));
    if (!line)
        return undefined;
    const parts = line.trim().split(/\s+/);
    if (parts.length < 8)
        return undefined;
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
function parseMeminfo(content) {
    const kb = parseKbField(content, "MemAvailable");
    return Math.round(kb / 1024);
}
/**
 * Parse /proc/loadavg for 1-minute load average.
 */
function parseLoadavg(content) {
    const parts = content.trim().split(/\s+/);
    return parts.length > 0 ? parseFloat(parts[0]) || 0 : 0;
}
/**
 * Read system-wide snapshot from /proc.
 */
function readSystemSnapshot() {
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
function readCpuSnapshot() {
    const content = readFileOr("/proc/stat", "");
    return parseProcStatCpu(content);
}
/**
 * List all numeric PID directories in /proc.
 */
function listPids() {
    try {
        return fs
            .readdirSync("/proc")
            .filter((d) => /^\d+$/.test(d))
            .map(Number);
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=proc.js.map

/***/ }),

/***/ 24:
/***/ ((module) => {

module.exports = require("node:fs");

/***/ }),

/***/ 760:
/***/ ((module) => {

module.exports = require("node:path");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId].call(module.exports, module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
/******/ 	
/******/ 	// startup
/******/ 	// Load entry module and return exports
/******/ 	// This entry module is referenced by other modules so it can't be inlined
/******/ 	var __webpack_exports__ = __nccwpck_require__(76);
/******/ 	module.exports = __webpack_exports__;
/******/ 	
/******/ })()
;
//# sourceMappingURL=index.js.map