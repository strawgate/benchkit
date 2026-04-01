import { useState, useEffect, useCallback, useMemo } from "preact/hooks";
import type { IndexFile, SeriesFile, SeriesEntry, RunEntry } from "@benchkit/format";
import { fetchIndex, fetchSeries, type DataSource } from "./fetch.js";
import { TrendChart } from "./components/TrendChart.js";
import { ComparisonBar } from "./components/ComparisonBar.js";
import { Leaderboard } from "./components/Leaderboard.js";
import { RunTable } from "./components/RunTable.js";
import { rankSeries } from "./leaderboard.js";

/**
 * Mapping from benchkit data model to competitive-dashboard model:
 *
 * - **Scenario** → one metric key from the index (e.g. `BenchmarkSort/small`).
 *   Each scenario has a dedicated `SeriesFile` with all competitors as series.
 * - **Competitor** → one series name inside a `SeriesFile` (e.g. `"OurImpl"`).
 * - **"Our" implementation** → identified by the `ownSeries` prop (matched against series names).
 * - **Metric** (secondary) → a label and unit drawn from the `SeriesFile` itself.
 *   When the index lists metrics that look like distinct measurement types
 *   (e.g. `ns_per_op` vs `throughput`), the consumer may pass a `scenarios` allowlist
 *   to restrict which metrics are shown as scenario cards.
 */

export interface CompetitiveDashboardProps {
  /** Where to fetch benchmark data from. */
  source: DataSource;
  /** CSS class applied to the root element. */
  class?: string;
  /**
   * Series name that identifies "our" implementation.
   * When provided, each scenario card displays "our" current rank prominently.
   */
  ownSeries?: string;
  /**
   * Restrict which metric keys are displayed as scenario cards.
   * Defaults to all non-monitor metrics found in the index.
   */
  scenarios?: string[];
  /** Custom scenario/metric label renderer. */
  metricLabelFormatter?: (metric: string) => string;
  /** Custom competitor/series name renderer. */
  seriesNameFormatter?: (name: string, entry: SeriesEntry) => string;
  /** Builds a URL for each commit SHA in the run table. */
  commitHref?: (commit: string, run: RunEntry) => string | undefined;
  /** Max data points per trend chart (default: 20). */
  maxPoints?: number;
  /** Max rows in the run table shown in drilldown (default: 20). */
  maxRuns?: number;
}

type View = "overview" | { scenario: string };

function isMonitorMetric(metric: string): boolean {
  return metric.startsWith("_monitor/");
}

/** Returns the gap between rank 1 and rank 2 as a signed number, or undefined. */
function leaderGap(sf: SeriesFile): number | undefined {
  const ranked = rankSeries(sf);
  if (ranked.length < 2) return undefined;
  return Math.abs(ranked[0].latestValue - ranked[1].latestValue);
}

/** Format a numeric gap for display. */
function formatGap(gap: number, unit: string | undefined): string {
  const abs = Math.abs(gap);
  const formatted =
    abs >= 1000
      ? Math.round(gap).toLocaleString("en-US")
      : gap.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return unit ? `${formatted} ${unit}` : formatted;
}

/** Returns the rank of `ownSeries` in the given series file, or undefined. */
function ownRank(sf: SeriesFile, ownSeries: string | undefined): number | undefined {
  if (!ownSeries) return undefined;
  const ranked = rankSeries(sf);
  const found = ranked.find((r) => r.name === ownSeries);
  return found?.rank;
}

function rankOrdinal(rank: number): string {
  const mod100 = rank % 100;
  const mod10 = rank % 10;
  if (mod10 === 1 && mod100 !== 11) return `${rank}st`;
  if (mod10 === 2 && mod100 !== 12) return `${rank}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${rank}rd`;
  return `${rank}th`;
}

export function CompetitiveDashboard({
  source,
  class: className,
  ownSeries,
  scenarios: scenariosProp,
  metricLabelFormatter,
  seriesNameFormatter,
  commitHref,
  maxPoints = 20,
  maxRuns = 20,
}: CompetitiveDashboardProps) {
  const [index, setIndex] = useState<IndexFile | null>(null);
  const [seriesMap, setSeriesMap] = useState<Map<string, SeriesFile>>(new Map());
  const [seriesErrors, setSeriesErrors] = useState<Map<string, string>>(new Map());
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
          const results = await Promise.allSettled(
            idx.metrics.map(async (m) => {
              const s = await fetchSeries(source, m, signal);
              return [m, s] as const;
            }),
          );
          const map = new Map<string, SeriesFile>();
          const errs = new Map<string, string>();
          results.forEach((r, i) => {
            const metric = idx.metrics![i];
            if (r.status === "fulfilled") map.set(metric, r.value[1]);
            else errs.set(metric, String(r.reason));
          });
          setSeriesMap(map);
          setSeriesErrors(errs);
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

  const handleScenarioClick = useCallback((scenario: string) => {
    setView((v) => (typeof v === "object" && v.scenario === scenario ? "overview" : { scenario }));
  }, []);

  const handleBack = useCallback(() => setView("overview"), []);

  /** Scenario metric keys to display (filtered by prop and monitor exclusion). */
  const scenarioKeys = useMemo<string[]>(() => {
    const allMetrics = index?.metrics ?? [];
    const candidates = scenariosProp
      ? allMetrics.filter((m) => scenariosProp.includes(m))
      : allMetrics.filter((m) => !isMonitorMetric(m));
    return candidates;
  }, [index, scenariosProp]);

  if (loading) return <div class={className}>Loading benchmark data…</div>;
  if (error) return <div class={className} style={{ color: "red" }}>{error}</div>;
  if (!index) return <div class={className}>No data found.</div>;

  const selectedScenario = typeof view === "object" ? view.scenario : null;
  const selectedSeries = selectedScenario ? seriesMap.get(selectedScenario) : null;
  const selectedError = selectedScenario ? (seriesErrors.get(selectedScenario) ?? null) : null;

  const label = (metric: string) =>
    metricLabelFormatter ? metricLabelFormatter(metric) : metric;

  // ── Drilldown view ────────────────────────────────────────────────────────
  if (selectedScenario) {
    return (
      <div class={className} style={{ fontFamily: "system-ui, sans-serif" }}>
        <button
          onClick={handleBack}
          style={{
            marginBottom: "16px",
            padding: "4px 12px",
            borderRadius: "4px",
            border: "1px solid #d1d5db",
            background: "#fff",
            cursor: "pointer",
            fontSize: "13px",
          }}
        >
          ← All scenarios
        </button>

        <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>{label(selectedScenario)}</h2>

        {selectedError ? (
          <div
            style={{
              color: "#ef4444",
              padding: "12px",
              border: "1px solid #fca5a5",
              borderRadius: "8px",
            }}
          >
            Failed to load scenario data: {selectedError}
          </div>
        ) : selectedSeries ? (
          <div>
            <TrendChart
              series={selectedSeries}
              title="Trend over time"
              maxPoints={maxPoints}
              seriesNameFormatter={seriesNameFormatter}
            />
            <div style={{ marginTop: "24px" }}>
              <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>Latest comparison</h3>
              <ComparisonBar
                series={selectedSeries}
                seriesNameFormatter={seriesNameFormatter}
              />
            </div>
            <div style={{ marginTop: "24px" }}>
              <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>Leaderboard</h3>
              <Leaderboard series={selectedSeries} seriesNameFormatter={seriesNameFormatter} />
            </div>
            <div style={{ marginTop: "24px" }}>
              <h3 style={{ fontSize: "14px", margin: "0 0 8px" }}>Recent runs</h3>
              <RunTable index={index} maxRows={maxRuns} commitHref={commitHref} />
            </div>
          </div>
        ) : (
          <div style={{ color: "#6b7280" }}>No data for this scenario.</div>
        )}
      </div>
    );
  }

  // ── Overview view ─────────────────────────────────────────────────────────
  return (
    <div class={className} style={{ fontFamily: "system-ui, sans-serif" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "16px",
        }}
      >
        {scenarioKeys.map((metric) => {
          const metricErr = seriesErrors.get(metric);
          if (metricErr) {
            return (
              <div
                key={metric}
                style={{
                  padding: "12px",
                  border: "1px solid #fca5a5",
                  borderRadius: "8px",
                  color: "#ef4444",
                  fontSize: "13px",
                }}
              >
                <strong>{label(metric)}</strong>
                <div style={{ marginTop: "4px" }}>Failed to load: {metricErr}</div>
              </div>
            );
          }

          const sf = seriesMap.get(metric);
          if (!sf) return null;

          const ranked = rankSeries(sf);
          const winner = ranked[0];
          const gap = leaderGap(sf);
          const ourRank = ownRank(sf, ownSeries);
          const competitorCount = ranked.length;

          const winnerLabel = winner
            ? (seriesNameFormatter ? seriesNameFormatter(winner.name, winner.entry) : winner.name)
            : undefined;

          const ownLabel =
            ownSeries && sf.series[ownSeries]
              ? (seriesNameFormatter ? seriesNameFormatter(ownSeries, sf.series[ownSeries]) : ownSeries)
              : undefined;

          const isOurWinner = winner && ownSeries && winner.name === ownSeries;

          return (
            <div
              key={metric}
              onClick={() => handleScenarioClick(metric)}
              style={{
                cursor: "pointer",
                padding: "16px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {/* Scenario name */}
              <div style={{ fontSize: "15px", fontWeight: 600, color: "#111827" }}>
                {label(metric)}
              </div>

              {/* Badges row */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", fontSize: "12px" }}>
                {winnerLabel && (
                  <span
                    style={{
                      background: isOurWinner ? "#dcfce7" : "#f3f4f6",
                      color: isOurWinner ? "#16a34a" : "#374151",
                      borderRadius: "4px",
                      padding: "2px 6px",
                      fontWeight: 600,
                    }}
                  >
                    ★ {winnerLabel}
                  </span>
                )}
                {ourRank !== undefined && !isOurWinner && ownLabel && (
                  <span
                    style={{
                      background: "#eff6ff",
                      color: "#2563eb",
                      borderRadius: "4px",
                      padding: "2px 6px",
                      fontWeight: 600,
                    }}
                  >
                    {rankOrdinal(ourRank)}: {ownLabel}
                  </span>
                )}
                {competitorCount > 1 && (
                  <span
                    style={{
                      background: "#f9fafb",
                      color: "#6b7280",
                      borderRadius: "4px",
                      padding: "2px 6px",
                    }}
                  >
                    {competitorCount} competitors
                  </span>
                )}
              </div>

              {/* Gap summary */}
              {gap !== undefined && winner && ranked.length >= 2 && (
                <div style={{ fontSize: "12px", color: "#6b7280" }}>
                  Gap to 2nd:{" "}
                  <span style={{ color: "#374151", fontWeight: 500 }}>
                    {formatGap(gap, sf.unit)}
                  </span>
                </div>
              )}

              {/* Mini sparkline */}
              <TrendChart
                series={sf}
                height={140}
                maxPoints={maxPoints}
                seriesNameFormatter={seriesNameFormatter}
              />
            </div>
          );
        })}

        {scenarioKeys.length === 0 && (
          <div style={{ color: "#6b7280", fontSize: "14px", gridColumn: "1/-1" }}>
            No scenarios found. Make sure benchmark data has been collected and the index is populated.
          </div>
        )}
      </div>
    </div>
  );
}
