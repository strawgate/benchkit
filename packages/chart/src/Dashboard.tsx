import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import type { IndexFile, SeriesFile, SeriesEntry, RunEntry } from "@benchkit/format";
import { fetchIndex, fetchSeries, type DataSource } from "./fetch.js";
import { TrendChart } from "./components/TrendChart.js";
import { ComparisonBar } from "./components/ComparisonBar.js";
import { RunTable } from "./components/RunTable.js";
import { MonitorSection } from "./components/MonitorSection.js";
import { TagFilter, filterSeriesFile } from "./components/TagFilter.js";
import { Leaderboard } from "./components/Leaderboard.js";
import { getWinner } from "./leaderboard.js";
import { detectRegressions, regressionTooltip, type RegressionResult } from "./utils.js";

export interface DashboardProps {
  source: DataSource;
  class?: string;
  /** Max data points per sparkline (default: 20) */
  maxPoints?: number;
  /** Max run rows in the table (default: 20) */
  maxRuns?: number;
  /** Custom metric label renderer */
  metricLabelFormatter?: (metric: string) => string;
  /** Custom series name renderer */
  seriesNameFormatter?: (name: string, entry: SeriesEntry) => string;
  /** Link commits to GitHub or other VCS */
  commitHref?: (commit: string, run: RunEntry) => string | undefined;
  /** Percentage change that triggers a regression warning (default: 10) */
  regressionThreshold?: number;
  /** Number of preceding data points to average for regression detection (default: 5) */
  regressionWindow?: number;
}

type View = "overview" | { metric: string };

/** Returns true when the metric name belongs to the monitor action. */
function isMonitorMetric(metric: string): boolean {
  return metric.startsWith("_monitor/");
}

export function Dashboard({
  source,
  class: className,
  maxPoints = 20,
  maxRuns = 20,
  metricLabelFormatter,
  seriesNameFormatter,
  commitHref,
  regressionThreshold = 10,
  regressionWindow = 5,
}: DashboardProps) {
  const [index, setIndex] = useState<IndexFile | null>(null);
  const [seriesMap, setSeriesMap] = useState<Map<string, SeriesFile>>(new Map());
  const [view, setView] = useState<View>("overview");
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setLoading(true);
    setError(null);
    fetchIndex(source, signal)
      .then(async (idx) => {
        setIndex(idx);
        if (idx.metrics) {
          const entries = await Promise.all(
            idx.metrics.map(async (m) => {
              const s = await fetchSeries(source, m, signal);
              return [m, s] as const;
            }),
          );
          setSeriesMap(new Map(entries));
        }
      })
      .catch((err) => {
        if (!signal.aborted) setError(String(err));
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [source.owner, source.repo, source.branch, source.baseUrl]);

  const handleMetricClick = useCallback((metric: string) => {
    setView((v) => (typeof v === "object" && v.metric === metric ? "overview" : { metric }));
  }, []);

  // Compute regressions for every loaded metric.
  const regressionMap = useMemo<Map<string, RegressionResult[]>>(() => {
    const map = new Map<string, RegressionResult[]>();
    for (const [metric, sf] of seriesMap.entries()) {
      const results = detectRegressions(sf, regressionThreshold, regressionWindow);
      if (results.length > 0) map.set(metric, results);
    }
    return map;
  }, [seriesMap, regressionThreshold, regressionWindow]);

  if (loading) return <div class={className}>Loading benchmark data…</div>;
  if (error) return <div class={className} style={{ color: "red" }}>{error}</div>;
  if (!index) return <div class={className}>No data found.</div>;

  // Partition metrics into user benchmarks and _monitor/ system metrics
  const userMetrics = [...seriesMap.entries()].filter(([m]) => !isMonitorMetric(m));
  const monitorMetrics = [...seriesMap.entries()].filter(([m]) => isMonitorMetric(m));
  const monitorSeriesMap = new Map(monitorMetrics);

  const userMetricNames = (index.metrics ?? []).filter((m) => !isMonitorMetric(m));

  const selectedSeries = typeof view === "object" ? seriesMap.get(view.metric) : null;
  const selectedRegressions = typeof view === "object" ? (regressionMap.get(view.metric) ?? []) : [];

  return (
    <div class={className} style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {userMetricNames.map((m) => (
          <button
            key={m}
            onClick={() => handleMetricClick(m)}
            style={{
              padding: "4px 12px",
              borderRadius: "4px",
              border: "1px solid #d1d5db",
              background: typeof view === "object" && view.metric === m ? "#3b82f6" : "#fff",
              color: typeof view === "object" && view.metric === m ? "#fff" : "#111",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            {metricLabelFormatter ? metricLabelFormatter(m) : m}
          </button>
        ))}
      </div>

      {selectedSeries ? (
        <div>
          <TrendChart
            series={filterSeriesFile(selectedSeries, activeFilters)}
            title={metricLabelFormatter ? metricLabelFormatter(selectedSeries.metric) : selectedSeries.metric}
            seriesNameFormatter={seriesNameFormatter}
            regressions={selectedRegressions}
          />
          <div style={{ marginTop: "16px" }}>
            <ComparisonBar
              series={filterSeriesFile(selectedSeries, activeFilters)}
              title={`Latest: ${metricLabelFormatter ? metricLabelFormatter(selectedSeries.metric) : selectedSeries.metric}`}
              seriesNameFormatter={seriesNameFormatter}
            />
          </div>
          {Object.keys(selectedSeries.series).length > 1 && (
            <div style={{ marginTop: "16px" }}>
              <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>Leaderboard</h3>
              <Leaderboard series={selectedSeries} seriesNameFormatter={seriesNameFormatter} />
            </div>
          )}
        </div>
      ) : (
        <div>
          <TagFilter seriesMap={new Map(userMetrics)} activeFilters={activeFilters} onFilterChange={setActiveFilters} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "16px" }}>
            {userMetrics.map(([metric, sf]) => {
              const seriesNames = Object.keys(sf.series);
              const isCompetitive = seriesNames.length > 1;
              const winnerName = isCompetitive ? getWinner(sf) : undefined;
              const winnerLabel = winnerName
                ? (seriesNameFormatter ? seriesNameFormatter(winnerName, sf.series[winnerName]) : winnerName)
                : undefined;
              const regressions = regressionMap.get(metric) ?? [];
              const hasRegression = regressions.length > 0;
              const tooltipText = hasRegression
                ? regressions.map((r) => regressionTooltip(metric, r, metricLabelFormatter)).join("\n")
                : undefined;
              return (
                <div
                  key={metric}
                  onClick={() => handleMetricClick(metric)}
                  title={tooltipText}
                  style={{
                    cursor: "pointer",
                    padding: "12px",
                    border: `1px solid ${hasRegression ? "#fca5a5" : "#e5e7eb"}`,
                    borderRadius: "8px",
                    position: "relative",
                  }}
                >
                  {hasRegression && (
                    <span
                      style={{
                        position: "absolute",
                        top: "8px",
                        right: "8px",
                        background: "#ef4444",
                        color: "#fff",
                        fontSize: "11px",
                        fontWeight: "bold",
                        padding: "2px 6px",
                        borderRadius: "9999px",
                        lineHeight: "1.4",
                        zIndex: 1,
                      }}
                    >
                      ⚠ regression
                    </span>
                  )}
                  {winnerLabel && (
                    <div style={{ marginBottom: "6px", fontSize: "12px" }}>
                      <span
                        style={{
                          background: "#dcfce7",
                          color: "#16a34a",
                          borderRadius: "4px",
                          padding: "2px 6px",
                          fontWeight: 600,
                        }}
                      >
                        ★ {winnerLabel}
                      </span>
                    </div>
                  )}
                  <TrendChart
                    series={filterSeriesFile(sf, activeFilters)}
                    title={metricLabelFormatter ? metricLabelFormatter(metric) : metric}
                    height={200}
                    maxPoints={maxPoints}
                    seriesNameFormatter={seriesNameFormatter}
                    regressions={regressions}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!selectedSeries && (
        <MonitorSection
          monitorSeriesMap={monitorSeriesMap}
          index={index}
          maxPoints={maxPoints}
          metricLabelFormatter={metricLabelFormatter}
          seriesNameFormatter={seriesNameFormatter}
          onMetricClick={handleMetricClick}
        />
      )}

      <div style={{ marginTop: "24px" }}>
        <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>Recent Runs</h3>
        <RunTable index={index} maxRows={maxRuns} commitHref={commitHref} />
      </div>
    </div>
  );
}

