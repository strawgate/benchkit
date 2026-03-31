import { useState, useEffect, useCallback } from "preact/hooks";
import type { IndexFile, SeriesFile, SeriesEntry, RunEntry } from "@benchkit/format";
import { fetchIndex, fetchSeries, type DataSource } from "./fetch.js";
import { TrendChart } from "./components/TrendChart.js";
import { ComparisonBar } from "./components/ComparisonBar.js";
import { RunTable } from "./components/RunTable.js";

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
}

type View = "overview" | { metric: string };

export function Dashboard({
  source,
  class: className,
  maxPoints = 20,
  maxRuns = 20,
  metricLabelFormatter,
  seriesNameFormatter,
  commitHref,
}: DashboardProps) {
  const [index, setIndex] = useState<IndexFile | null>(null);
  const [seriesMap, setSeriesMap] = useState<Map<string, SeriesFile>>(new Map());
  const [view, setView] = useState<View>("overview");
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

  if (loading) return <div class={className}>Loading benchmark data…</div>;
  if (error) return <div class={className} style={{ color: "red" }}>{error}</div>;
  if (!index) return <div class={className}>No data found.</div>;

  const selectedSeries = typeof view === "object" ? seriesMap.get(view.metric) : null;

  return (
    <div class={className} style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        {index.metrics?.map((m) => (
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
            series={selectedSeries}
            title={metricLabelFormatter ? metricLabelFormatter(selectedSeries.metric) : selectedSeries.metric}
            seriesNameFormatter={seriesNameFormatter}
          />
          <div style={{ marginTop: "16px" }}>
            <ComparisonBar
              series={selectedSeries}
              title={`Latest: ${metricLabelFormatter ? metricLabelFormatter(selectedSeries.metric) : selectedSeries.metric}`}
              seriesNameFormatter={seriesNameFormatter}
            />
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: "16px" }}>
          {[...seriesMap.entries()].map(([metric, sf]) => (
            <div
              key={metric}
              onClick={() => handleMetricClick(metric)}
              style={{ cursor: "pointer", padding: "12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}
            >
              <TrendChart
                series={sf}
                title={metricLabelFormatter ? metricLabelFormatter(metric) : metric}
                height={200}
                maxPoints={maxPoints}
                seriesNameFormatter={seriesNameFormatter}
              />
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "24px" }}>
        <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>Recent Runs</h3>
        <RunTable index={index} maxRows={maxRuns} commitHref={commitHref} />
      </div>
    </div>
  );
}
