import type { RunEntry, SeriesFile, SeriesEntry, MonitorContext } from "@benchkit/format";
import { TrendChart } from "./TrendChart.js";
import { ComparisonBar } from "./ComparisonBar.js";
import { MonitorSection } from "./MonitorSection.js";

// ─── Prop types ────────────────────────────────────────────────────────────────

/** A single metric snapshot scoped to the selected run. */
export interface RunMetricSnapshot {
  /** Metric name, e.g. "ns_per_op" or "_monitor/cpu_user_pct". */
  metric: string;
  /** The full series file for this metric (may contain multiple named series). */
  series: SeriesFile;
}

/** A single entry used to compare the selected run against a baseline. */
export interface RunComparisonEntry {
  /** Metric name. */
  metric: string;
  /** Human-readable label for the metric. */
  label?: string;
  /** Value for the selected run. */
  current: number;
  /** Value for the baseline run. */
  baseline: number;
  /** Unit string, e.g. "ns/op". */
  unit?: string;
  /** Whether a smaller value is better. Defaults to `smaller_is_better`. */
  direction?: "bigger_is_better" | "smaller_is_better";
}

export interface RunDetailProps {
  // ── Raw run data ────────────────────────────────────────────────────────────

  /** The run entry from the index. Contains id, timestamp, commit, ref, etc. */
  run: RunEntry;

  /**
   * Pre-aggregated metric snapshots for this run's data.
   * Pass only the user-facing (non-monitor) metrics here.
   * Each snapshot's `series` is typically a full `SeriesFile`; RunDetail will
   * highlight the data point that belongs to this run.
   */
  metricSnapshots?: RunMetricSnapshot[];

  /**
   * Monitor metric snapshots — metrics whose names start with `_monitor/`.
   * Rendered in the Runner Metrics section, visually separated from user benchmarks.
   */
  monitorSnapshots?: RunMetricSnapshot[];

  // ── Derived comparison data ─────────────────────────────────────────────────

  /**
   * Optional baseline comparison entries supplied by a parent dashboard.
   * When provided a "vs baseline" section is rendered with percentage deltas.
   */
  comparisonEntries?: RunComparisonEntry[];

  /** Label for the baseline context, e.g. "main branch" or "last release". */
  baselineLabel?: string;

  // ── Rendering callbacks / links ─────────────────────────────────────────────

  /**
   * Builds a URL for the commit SHA shown in the metadata row.
   * When omitted the SHA is rendered as plain text.
   */
  commitHref?: (commit: string, run: RunEntry) => string | undefined;

  /**
   * Builds an external artifact URL, e.g. a link to the CI run.
   * Rendered as a "View artifacts" link when provided.
   */
  artifactHref?: (run: RunEntry) => string | undefined;

  /** Custom metric label renderer. */
  metricLabelFormatter?: (metric: string) => string;

  /** Custom series name renderer. */
  seriesNameFormatter?: (name: string, entry: SeriesEntry) => string;

  /** Max data points per sparkline (default: 20). */
  maxPoints?: number;

  /** CSS class applied to the root element. */
  class?: string;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function percentChange(current: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((current - baseline) / Math.abs(baseline)) * 100;
}

function formatPercent(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

// ─── Shared table styles ───────────────────────────────────────────────────────

const thStyle: Record<string, string> = {
  padding: "8px 12px",
  fontWeight: "600",
};

const tdStyle: Record<string, string> = {
  padding: "6px 12px",
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function MetadataRow({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div style={{ display: "flex", gap: "8px", fontSize: "13px", lineHeight: "1.6" }}>
      <span style={{ color: "#6b7280", minWidth: "110px", flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#111827", wordBreak: "break-all" }}>{children}</span>
    </div>
  );
}

function RunMetadataCard({
  run,
  commitHref,
  artifactHref,
}: {
  run: RunEntry;
  commitHref?: (commit: string, run: RunEntry) => string | undefined;
  artifactHref?: (run: RunEntry) => string | undefined;
}) {
  const artifactUrl = artifactHref?.(run);
  const commitUrl = run.commit ? commitHref?.(run.commit, run) : undefined;

  return (
    <div
      style={{
        padding: "16px",
        border: "1px solid #e5e7eb",
        borderRadius: "8px",
        background: "#f9fafb",
        marginBottom: "20px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
        <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "#111827" }}>Run details</h3>
        {artifactUrl && (
          <a
            href={artifactUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "12px", color: "#3b82f6", textDecoration: "none" }}
          >
            View artifacts ↗
          </a>
        )}
      </div>

      <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
        <MetadataRow label="Run ID">
          <code style={{ fontSize: "12px", background: "#f3f4f6", padding: "1px 4px", borderRadius: "3px" }}>{run.id}</code>
        </MetadataRow>

        <MetadataRow label="Timestamp">{formatTimestamp(run.timestamp)}</MetadataRow>

        {run.commit && (
          <MetadataRow label="Commit">
            {commitUrl ? (
              <a href={commitUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#3b82f6", textDecoration: "none" }}>
                <code style={{ fontSize: "12px" }}>{run.commit.slice(0, 8)}</code>
              </a>
            ) : (
              <code style={{ fontSize: "12px" }}>{run.commit.slice(0, 8)}</code>
            )}
          </MetadataRow>
        )}

        {run.ref && (
          <MetadataRow label="Ref">{run.ref.replace("refs/heads/", "")}</MetadataRow>
        )}

        {run.benchmarks != null && (
          <MetadataRow label="Benchmarks">{run.benchmarks}</MetadataRow>
        )}

        {run.metrics && run.metrics.length > 0 && (
          <MetadataRow label="Metrics">{run.metrics.length} metric{run.metrics.length !== 1 ? "s" : ""}</MetadataRow>
        )}
      </div>
    </div>
  );
}

function ComparisonSection({
  entries,
  baselineLabel,
  metricLabelFormatter,
}: {
  entries: RunComparisonEntry[];
  baselineLabel?: string;
  metricLabelFormatter?: (metric: string) => string;
}) {
  return (
    <div style={{ marginTop: "24px" }}>
      <h3 style={{ fontSize: "14px", margin: "0 0 12px", color: "#374151" }}>
        vs {baselineLabel ?? "baseline"}
      </h3>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
            <th style={thStyle}>Metric</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Current</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Baseline</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Change</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const pct = percentChange(e.current, e.baseline);
            const isBetter =
              e.direction === "bigger_is_better" ? pct > 0 : pct < 0;
            const isWorse =
              e.direction === "bigger_is_better" ? pct < 0 : pct > 0;
            const changeColor = isBetter ? "#16a34a" : isWorse ? "#dc2626" : "#6b7280";
            const label = e.label ?? (metricLabelFormatter ? metricLabelFormatter(e.metric) : e.metric);
            const unit = e.unit ? ` ${e.unit}` : "";
            return (
              <tr key={e.metric} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={tdStyle}>{label}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  {e.current}{unit}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: "#6b7280" }}>
                  {e.baseline}{unit}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: changeColor, fontWeight: 600 }}>
                  {pct === 0 ? "—" : formatPercent(pct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Public component ──────────────────────────────────────────────────────────

/**
 * `RunDetail` is a reusable first-class surface for inspecting a single
 * benchmark run. It can be embedded in any dashboard context:
 *
 * - `RunDashboard` — browsing run history
 * - `CompetitiveDashboard` — drilling into a competitive benchmark run
 * - Custom metric explorers
 *
 * The component renders:
 * 1. **Run metadata** — id, timestamp, commit, ref, benchmark/metric counts.
 * 2. **Metric snapshots** — a sparkline + comparison bar per user metric.
 * 3. **Runner metrics** — `_monitor/` series in a visually separated section.
 * 4. **Baseline comparison** — optional delta table against a parent-supplied baseline.
 *
 * @example
 * ```tsx
 * import { RunDetail } from "@benchkit/chart";
 *
 * <RunDetail
 *   run={selectedRun}
 *   metricSnapshots={userSnapshots}
 *   monitorSnapshots={monitorSnapshots}
 *   comparisonEntries={comparison}
 *   baselineLabel="main"
 *   commitHref={(sha, run) => `https://github.com/org/repo/commit/${sha}`}
 *   artifactHref={(run) => `https://github.com/org/repo/actions/runs/${run.id}`}
 *   metricLabelFormatter={(m) => m.replace(/_/g, " ")}
 * />
 * ```
 */
export function RunDetail({
  run,
  metricSnapshots = [],
  monitorSnapshots = [],
  comparisonEntries,
  baselineLabel,
  commitHref,
  artifactHref,
  metricLabelFormatter,
  seriesNameFormatter,
  maxPoints = 20,
  class: className,
}: RunDetailProps) {
  // Build a minimal IndexFile-compatible object for MonitorSection.
  const fakeIndex = { runs: [run] };

  // Build the monitor series map from monitor snapshots.
  const monitorSeriesMap = new Map<string, SeriesFile>(
    monitorSnapshots.map((s) => [s.metric, s.series]),
  );

  const monitorCtx: MonitorContext | undefined = run.monitor;

  return (
    <div class={className} style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* ── Run metadata ─────────────────────────────────────── */}
      <RunMetadataCard run={run} commitHref={commitHref} artifactHref={artifactHref} />

      {/* ── User metric snapshots ─────────────────────────────── */}
      {metricSnapshots.length > 0 && (
        <div>
          <h3 style={{ fontSize: "14px", margin: "0 0 12px", color: "#374151" }}>Metrics</h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
              gap: "16px",
            }}
          >
            {metricSnapshots.map(({ metric, series }) => {
              const label = metricLabelFormatter ? metricLabelFormatter(metric) : metric;
              return (
                <div
                  key={metric}
                  style={{
                    padding: "12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                  }}
                >
                  <TrendChart
                    series={series}
                    title={label}
                    height={200}
                    maxPoints={maxPoints}
                    seriesNameFormatter={seriesNameFormatter}
                  />
                  <div style={{ marginTop: "12px" }}>
                    <ComparisonBar
                      series={series}
                      title={`Latest: ${label}`}
                      seriesNameFormatter={seriesNameFormatter}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Baseline comparison ───────────────────────────────── */}
      {comparisonEntries && comparisonEntries.length > 0 && (
        <ComparisonSection
          entries={comparisonEntries}
          baselineLabel={baselineLabel}
          metricLabelFormatter={metricLabelFormatter}
        />
      )}

      {/* ── Runner / monitor metrics ──────────────────────────── */}
      {(monitorSeriesMap.size > 0 || monitorCtx) && (
        <MonitorSection
          monitorSeriesMap={monitorSeriesMap}
          index={fakeIndex}
          maxPoints={maxPoints}
          metricLabelFormatter={metricLabelFormatter}
          seriesNameFormatter={seriesNameFormatter}
        />
      )}
    </div>
  );
}
