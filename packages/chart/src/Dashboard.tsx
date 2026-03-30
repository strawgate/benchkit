import { useState, useEffect, useCallback } from "preact/hooks";
import type { IndexFile, SeriesFile } from "@benchkit/format";
import { fetchIndex, fetchSeries, type DataSource } from "./fetch.js";
import { TrendChart } from "./components/TrendChart.js";
import { ComparisonBar } from "./components/ComparisonBar.js";
import { RunTable } from "./components/RunTable.js";

export interface DashboardProps {
  source: DataSource;
  class?: string;
}

type View = "overview" | { metric: string };

export function Dashboard({ source, class: className }: DashboardProps) {
  const [index, setIndex] = useState<IndexFile | null>(null);
  const [seriesMap, setSeriesMap] = useState<Map<string, SeriesFile>>(new Map());
  const [view, setView] = useState<View>("overview");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchIndex(source)
      .then(async (idx) => {
        setIndex(idx);
        if (idx.metrics) {
          const entries = await Promise.all(
            idx.metrics.map(async (m) => {
              const s = await fetchSeries(source, m);
              return [m, s] as const;
            }),
          );
          setSeriesMap(new Map(entries));
        }
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [source.owner, source.repo, source.branch]);

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
            {m}
          </button>
        ))}
      </div>

      {selectedSeries ? (
        <div>
          <TrendChart series={selectedSeries} title={selectedSeries.metric} />
          <div style={{ marginTop: "16px" }}>
            <ComparisonBar series={selectedSeries} title={`Latest: ${selectedSeries.metric}`} />
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
              <TrendChart series={sf} title={metric} height={200} maxPoints={20} />
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "24px" }}>
        <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>Recent Runs</h3>
        <RunTable index={index} maxRows={20} />
      </div>
    </div>
  );
}
