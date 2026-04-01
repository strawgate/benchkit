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
import { defaultMetricLabel } from "./labels.js";
import { transformSeriesDataset, filtersFromTagRecord } from "./dataset-transforms.js";

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

function formatRef(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  if (ref.startsWith("refs/heads/")) return ref.replace("refs/heads/", "");
  const pullMatch = /^refs\/pull\/(\d+)\/merge$/.exec(ref);
  if (pullMatch) return `PR #${pullMatch[1]}`;
  if (ref.startsWith("refs/tags/")) return `tag ${ref.replace("refs/tags/", "")}`;
  return ref;
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
  const [seriesErrors, setSeriesErrors] = useState<Map<string, string>>(new Map());
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

  const rootClassName = ["bk-dashboard", className].filter(Boolean).join(" ");
  const formatMetric = metricLabelFormatter ?? defaultMetricLabel;

  if (loading) {
    return (
      <div class={rootClassName}>
        <div class="bk-loading">
          <h2 class="bk-loading__title">Loading benchmark dashboard</h2>
          <p class="bk-loading__body">Fetching benchmark index and metric series for the latest runs.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div class={rootClassName}>
        <div class="bk-state">
          <h2 class="bk-state__title">Could not load benchmark data</h2>
          <p class="bk-state__body">{error}</p>
        </div>
      </div>
    );
  }

  if (!index) {
    return (
      <div class={rootClassName}>
        <div class="bk-state">
          <h2 class="bk-state__title">No benchmark data found</h2>
          <p class="bk-state__body">This dashboard needs an aggregated `data/index.json` and metric series files.</p>
        </div>
      </div>
    );
  }

  // Partition metrics into user benchmarks and _monitor/ system metrics
  const userMetrics = [...seriesMap.entries()].filter(([m]) => !isMonitorMetric(m));
  const monitorMetrics = [...seriesMap.entries()].filter(([m]) => isMonitorMetric(m));
  const monitorSeriesMap = new Map(monitorMetrics);

  const userMetricNames = (index.metrics ?? []).filter((m) => !isMonitorMetric(m));

  const selectedSeries = typeof view === "object" ? seriesMap.get(view.metric) : null;
  // Use the transform layer for the focused metric detail view so filtering,
  // grouping, and aggregation are all driven by the same bounded API.
  const filteredSelectedSeries = selectedSeries
    ? transformSeriesDataset(selectedSeries, { filters: filtersFromTagRecord(activeFilters) })
    : null;
  const selectedMetricError = typeof view === "object" ? (seriesErrors.get(view.metric) ?? null) : null;
  const selectedRegressions = typeof view === "object" ? (regressionMap.get(view.metric) ?? []) : [];
  const activeFilterCount = Object.keys(activeFilters).length;
  const totalUserSeriesCount = userMetrics.reduce((sum, [, sf]) => sum + Object.keys(sf.series).length, 0);
  const visibleSeriesCount = userMetrics.reduce(
    (sum, [, sf]) => sum + Object.keys(filterSeriesFile(sf, activeFilters).series).length,
    0,
  );
  const latestRun = index.runs[0];
  const focusedSeriesCount = filteredSelectedSeries ? Object.keys(filteredSelectedSeries.series).length : 0;
  const monitorMetricCount = monitorMetrics.length;

  return (
    <div class={rootClassName}>
      <div class="bk-shell">
        <section class="bk-hero bk-hero--compact">
          <div class="bk-hero__header bk-hero__header--compact">
            <div>
              <p class="bk-hero__eyebrow">Benchkit dashboard</p>
              <h2 class="bk-hero__title bk-hero__title--compact">Performance overview</h2>
            </div>
            <div class="bk-kpis bk-kpis--compact">
              <div class="bk-kpi">
                <span class="bk-kpi__label">Metrics</span>
                <span class="bk-kpi__value">{userMetricNames.length}</span>
              </div>
              <div class="bk-kpi">
                <span class="bk-kpi__label">Runs</span>
                <span class="bk-kpi__value">{index.runs.length}</span>
              </div>
              <div class="bk-kpi">
                <span class="bk-kpi__label">Series</span>
                <span class="bk-kpi__value">{visibleSeriesCount}</span>
              </div>
              <div class="bk-kpi">
                <span class="bk-kpi__label">Monitor</span>
                <span class="bk-kpi__value">{monitorMetricCount}</span>
              </div>
            </div>
          </div>
          {latestRun && (
            <p class="bk-hero__body">
              Latest run: <strong>{latestRun.id}</strong>
              {formatRef(latestRun.ref) ? ` on ${formatRef(latestRun.ref)}` : ""}
              {latestRun.commit ? ` at ${latestRun.commit.slice(0, 8)}` : ""}.
            </p>
          )}
        </section>

        <section class="bk-toolbar">
          <div class="bk-toolbar__row">
            <div class="bk-toolbar__group">
              <span class="bk-toolbar__label">View</span>
              <button class="bk-link-button" type="button" onClick={() => setView("overview")}>
                Overview
              </button>
              {selectedSeries && (
                <span class="bk-badge bk-badge--muted">
                  Focused metric: {formatMetric(selectedSeries.metric)}
                </span>
              )}
            </div>
            <div class="bk-toolbar__group">
              {activeFilterCount > 0 && <span class="bk-badge bk-badge--muted">{activeFilterCount} active filters</span>}
              <span class="bk-badge bk-badge--muted">
                {selectedSeries ? `${focusedSeriesCount} visible series` : `${visibleSeriesCount}/${totalUserSeriesCount} visible series`}
              </span>
            </div>
          </div>
          <div class="bk-toolbar__row">
            <div class="bk-toolbar__group">
              <span class="bk-toolbar__label">Metrics</span>
              {userMetricNames.map((metric) => (
                <button
                  key={metric}
                  type="button"
                  class="bk-tab"
                  aria-pressed={typeof view === "object" && view.metric === metric}
                  onClick={() => handleMetricClick(metric)}
                >
                  {formatMetric(metric)}
                </button>
              ))}
            </div>
          </div>
          <TagFilter seriesMap={new Map(userMetrics)} activeFilters={activeFilters} onFilterChange={setActiveFilters} />
        </section>

        {selectedMetricError ? (
          <div class="bk-state">
            <h2 class="bk-state__title">Could not load {typeof view === "object" ? formatMetric(view.metric) : "metric"}</h2>
            <p class="bk-state__body">{selectedMetricError}</p>
          </div>
        ) : selectedSeries ? (
          <section class="bk-section">
            <div class="bk-section__header">
              <div>
                <h3 class="bk-section__title">{formatMetric(selectedSeries.metric)}</h3>
              </div>
              <button class="bk-link-button" type="button" onClick={() => setView("overview")}>
                Back to overview
              </button>
            </div>

            <div class="bk-card">
              <TrendChart
                series={filteredSelectedSeries!}
                title={formatMetric(selectedSeries.metric)}
                summary="Time trend across the currently visible series."
                height={360}
                maxPoints={maxPoints}
                seriesNameFormatter={seriesNameFormatter}
                regressions={selectedRegressions}
              />
            </div>

            <div class="bk-overview-grid">
              <div class="bk-card">
                <ComparisonBar
                  series={filteredSelectedSeries!}
                  title={`Latest ${formatMetric(selectedSeries.metric)}`}
                  height={300}
                  seriesNameFormatter={seriesNameFormatter}
                  showValuesList={false}
                />
              </div>

              {filteredSelectedSeries && Object.keys(filteredSelectedSeries.series).length > 1 && (
                <div class="bk-card">
                  <div class="bk-section__header">
                    <div>
                      <h4 class="bk-section__title">Leaderboard</h4>
                      <p class="bk-section__description">Fastest or best-performing series at the latest run.</p>
                    </div>
                  </div>
                  <Leaderboard series={filteredSelectedSeries} seriesNameFormatter={seriesNameFormatter} />
                </div>
              )}
            </div>
          </section>
        ) : (
          <section class="bk-section">
            <div class="bk-section__header">
              <div>
                <h3 class="bk-section__title">Primary metrics</h3>
              </div>
            </div>
            <div class="bk-overview-grid">
              {userMetricNames.map((metric) => {
                const metricErr = seriesErrors.get(metric);
                if (metricErr) {
                  return (
                    <div key={metric} class="bk-card">
                      <div class="bk-card__top">
                        <div>
                          <h4 class="bk-card__title">{formatMetric(metric)}</h4>
                          <p class="bk-card__hint">This metric could not be loaded.</p>
                        </div>
                        <span class="bk-badge bk-badge--danger">Load error</span>
                      </div>
                      <p class="bk-muted">{metricErr}</p>
                    </div>
                  );
                }

                const sf = seriesMap.get(metric);
                if (!sf) return null;

                const filteredSeries = filterSeriesFile(sf, activeFilters);
                const visibleEntries = Object.keys(filteredSeries.series);
                const isCompetitive = visibleEntries.length > 1;
                const winnerName = isCompetitive ? getWinner(filteredSeries) : undefined;
                const winnerLabel = winnerName
                  ? (seriesNameFormatter ? seriesNameFormatter(winnerName, filteredSeries.series[winnerName]) : winnerName)
                  : undefined;
                const regressions = regressionMap.get(metric) ?? [];
                const hasRegression = regressions.length > 0;
                const tooltipText = hasRegression
                  ? regressions.map((r) => regressionTooltip(metric, r, formatMetric)).join("\n")
                  : undefined;

                return (
                  <div
                    key={metric}
                    class="bk-card bk-card--interactive"
                    onClick={() => handleMetricClick(metric)}
                    title={tooltipText}
                  >
                    <div class="bk-card__top">
                      <div>
                        <h4 class="bk-card__title">{formatMetric(metric)}</h4>
                      </div>
                      <span class="bk-badge bk-badge--muted">{visibleEntries.length} series</span>
                    </div>
                    <div class="bk-badge-row">
                      {winnerLabel && <span class="bk-badge bk-badge--success">Winner: {winnerLabel}</span>}
                      {hasRegression && <span class="bk-badge bk-badge--danger">Regression detected</span>}
                    </div>
                    <TrendChart
                      series={filteredSeries}
                      height={152}
                      maxPoints={maxPoints}
                      seriesNameFormatter={seriesNameFormatter}
                      compact={true}
                      showLegend={false}
                      showSeriesCount={false}
                      regressions={regressions}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {!selectedSeries && (
          <MonitorSection
            monitorSeriesMap={monitorSeriesMap}
            index={index}
            maxPoints={maxPoints}
            metricLabelFormatter={formatMetric}
            seriesNameFormatter={seriesNameFormatter}
            onMetricClick={handleMetricClick}
          />
        )}

        <section class="bk-section">
          <div class="bk-section__header">
            <div>
              <h3 class="bk-section__title">Recent runs</h3>
              <p class="bk-section__description">Commit context and captured metric coverage for the latest benchmark executions.</p>
            </div>
          </div>
          <RunTable index={index} maxRows={maxRuns} commitHref={commitHref} />
        </section>
      </div>
    </div>
  );
}

