import type { SeriesFile, SeriesEntry, IndexFile, MonitorContext } from "@benchkit/format";
import { TrendChart } from "./TrendChart.js";

export interface MonitorSectionProps {
  /** Map of _monitor/ prefixed metric names → series files */
  monitorSeriesMap: Map<string, SeriesFile>;
  /** The full index, used to surface the latest runner context */
  index: IndexFile;
  /** Max data points per sparkline */
  maxPoints?: number;
  /** Custom metric label renderer */
  metricLabelFormatter?: (metric: string) => string;
  /** Custom series name renderer */
  seriesNameFormatter?: (name: string, entry: SeriesEntry) => string;
  /** Called when user clicks a monitor metric card */
  onMetricClick?: (metric: string) => void;
  /** Currently selected metric (for highlighting) */
  selectedMetric?: string | null;
}

function RunnerContextCard({ ctx }: { ctx: MonitorContext }) {
  const items: Array<[string, string]> = [];

  if (ctx.runner_os) items.push(["OS", ctx.runner_arch ? `${ctx.runner_os} (${ctx.runner_arch})` : ctx.runner_os]);
  if (ctx.kernel) items.push(["Kernel", ctx.kernel]);
  if (ctx.cpu_model) items.push(["CPU", ctx.cpu_count ? `${ctx.cpu_model} × ${ctx.cpu_count}` : ctx.cpu_model]);
  if (ctx.total_memory_mb != null) items.push(["Memory", `${Math.round(ctx.total_memory_mb / 1024)} GB`]);
  if (ctx.poll_interval_ms) items.push(["Poll interval", `${ctx.poll_interval_ms} ms`]);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 24px",
        padding: "10px 14px",
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "6px",
        fontSize: "12px",
        color: "#475569",
        marginBottom: "16px",
      }}
    >
      {items.map(([label, value]) => (
        <span key={label}>
          <span style={{ fontWeight: 600, color: "#334155" }}>{label}:</span>
          {" "}{value}
        </span>
      ))}
    </div>
  );
}

export function MonitorSection({
  monitorSeriesMap,
  index,
  maxPoints = 20,
  metricLabelFormatter,
  seriesNameFormatter,
  onMetricClick,
  selectedMetric,
}: MonitorSectionProps) {
  if (monitorSeriesMap.size === 0) return null;

  // Find the most recent run that has a monitor context
  const latestMonitorContext = index.runs.find((r) => r.monitor)?.monitor ?? null;

  // Strip the _monitor/ prefix for display unless the formatter handles it
  const displayLabel = (metric: string) => {
    if (metricLabelFormatter) return metricLabelFormatter(metric);
    return metric.replace(/^_monitor\//, "");
  };

  return (
    <div>
      {/* Divider */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          margin: "32px 0 20px",
        }}
      >
        <hr style={{ flex: 1, border: "none", borderTop: "1px solid #e2e8f0", margin: 0 }} />
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "#64748b",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            whiteSpace: "nowrap",
          }}
        >
          Runner Metrics
        </span>
        <hr style={{ flex: 1, border: "none", borderTop: "1px solid #e2e8f0", margin: 0 }} />
      </div>

      {/* Runner context card */}
      {latestMonitorContext && <RunnerContextCard ctx={latestMonitorContext} />}

      {/* Monitor metric charts */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
          gap: "16px",
        }}
      >
        {[...monitorSeriesMap.entries()].map(([metric, sf]) => (
          <div
            key={metric}
            onClick={() => onMetricClick?.(metric)}
            style={{
              cursor: onMetricClick ? "pointer" : "default",
              padding: "12px",
              border: `1px solid ${selectedMetric === metric ? "#94a3b8" : "#e2e8f0"}`,
              borderRadius: "8px",
              background: "#f8fafc",
            }}
          >
            <TrendChart
              series={sf}
              title={displayLabel(metric)}
              height={200}
              maxPoints={maxPoints}
              seriesNameFormatter={seriesNameFormatter}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
