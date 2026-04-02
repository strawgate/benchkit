import { useRef, useEffect, useMemo } from "preact/hooks";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import "chartjs-adapter-date-fns";
import type { Sample, DataPoint } from "@benchkit/format";
import { getChartTheme } from "../theme.js";
import {
  samplesToDataPoints,
  dataPointsToComparisonData,
} from "../comparison-transforms.js";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
);

/** Base (blue) and current/PR (green) — matching the beats-bench convention. */
const BASE_COLOR = "#3b82f6";
const CURRENT_COLOR = "#22c55e";

export interface ComparisonChartProps {
  /** Metric name used to extract values from `Sample[]` data and shown on the y-axis. */
  metric: string;
  unit?: string;

  /**
   * Intra-run time-series mode: pass `Sample[]` arrays.
   * The x-axis uses elapsed seconds (`sample.t`).
   */
  baseSamples?: Sample[];
  currentSamples?: Sample[];

  /**
   * Cross-run aggregated mode: pass `DataPoint[]` arrays.
   * The x-axis uses ISO-8601 timestamps.
   */
  basePoints?: DataPoint[];
  currentPoints?: DataPoint[];

  /** Label for the base/baseline trace. Defaults to "Base". */
  baseLabel?: string;
  /** Label for the current/PR trace. Defaults to "Current". */
  currentLabel?: string;

  /** Color for the base/baseline trace. Defaults to blue (#3b82f6). */
  baseColor?: string;
  /** Color for the current/PR trace. Defaults to green (#22c55e). */
  currentColor?: string;

  height?: number;
  title?: string;
  subtitle?: string;
  /** CSS class name */
  class?: string;
}

function formatValue(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 0 : 2 });
}

export function ComparisonChart({
  metric,
  unit,
  baseSamples,
  currentSamples,
  basePoints,
  currentPoints,
  baseLabel = "Base",
  currentLabel = "Current",
  baseColor = BASE_COLOR,
  currentColor = CURRENT_COLOR,
  height = 300,
  title,
  subtitle,
  class: className,
}: ComparisonChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  /** true when operating in Sample[] (intra-run) mode */
  const isSamplesMode = baseSamples !== undefined || currentSamples !== undefined;

  const baseData = useMemo(() => {
    if (isSamplesMode) {
      return samplesToDataPoints(baseSamples ?? [], metric);
    }
    return dataPointsToComparisonData(basePoints ?? []);
  }, [isSamplesMode, baseSamples, basePoints, metric]);

  const currentData = useMemo(() => {
    if (isSamplesMode) {
      return samplesToDataPoints(currentSamples ?? [], metric);
    }
    return dataPointsToComparisonData(currentPoints ?? []);
  }, [isSamplesMode, currentSamples, currentPoints, metric]);

  const isEmpty = baseData.length === 0 && currentData.length === 0;

  useEffect(() => {
    if (!canvasRef.current || !wrapperRef.current) return;

    if (isEmpty) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return;
    }

    const theme = getChartTheme(wrapperRef.current);

    const datasets: ChartData<"line">["datasets"] = [
      {
        label: baseLabel,
        data: baseData as { x: number; y: number }[],
        borderColor: baseColor,
        backgroundColor: `${baseColor}22`,
        fill: false,
        tension: 0,
        borderWidth: 1.75,
        clip: 8,
        spanGaps: true,
        pointRadius: 2.5,
        pointHoverRadius: 6,
        pointBackgroundColor: baseColor,
        pointBorderColor: baseColor,
      },
      {
        label: currentLabel,
        data: currentData as { x: number; y: number }[],
        borderColor: currentColor,
        backgroundColor: `${currentColor}22`,
        fill: false,
        tension: 0,
        borderWidth: 1.75,
        clip: 8,
        spanGaps: true,
        pointRadius: 2.5,
        pointHoverRadius: 6,
        pointBackgroundColor: currentColor,
        pointBorderColor: currentColor,
      },
    ].filter((ds) => ds.data.length > 0);

    const xScale: ChartOptions<"line">["scales"] = isSamplesMode
      ? {
          x: {
            type: "linear" as const,
            title: {
              display: true,
              text: "Time (s)",
              color: theme.mutedText,
            },
            grid: { color: theme.grid },
            ticks: { color: theme.mutedText },
            border: { color: theme.border },
          },
        }
      : {
          x: {
            type: "time" as const,
            time: { tooltipFormat: "PPpp" },
            title: { display: false },
            grid: { color: theme.grid },
            ticks: {
              color: theme.mutedText,
              maxRotation: 0,
              autoSkipPadding: 18,
              maxTicksLimit: 7,
            },
            border: { color: theme.border },
          },
        };

    const options: ChartOptions<"line"> = {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { left: 4, right: 8, top: 4, bottom: 2 },
      },
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.tooltipBackground,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          titleColor: "#f8fafc",
          bodyColor: "#e2e8f0",
          padding: 12,
          displayColors: true,
          callbacks: {
            title: (items) => {
              const raw = items[0]?.label;
              if (!raw) return "";
              if (isSamplesMode) return `t = ${Number(raw).toFixed(2)} s`;
              return new Date(raw).toLocaleString();
            },
            label: (item) => {
              const v = item.parsed.y;
              if (v == null) return "";
              const u = unit ?? "";
              return ` ${item.dataset.label}: ${formatValue(v)}${u ? ` ${u}` : ""}`;
            },
          },
        },
      },
      scales: {
        ...xScale,
        y: {
          title: {
            display: true,
            text: unit ?? metric,
            color: theme.mutedText,
          },
          beginAtZero: false,
          grid: { color: theme.grid },
          ticks: {
            color: theme.mutedText,
            maxTicksLimit: 6,
            callback: (value) => formatValue(Number(value)),
          },
          border: { color: theme.border },
        },
      },
    };

    if (chartRef.current) {
      chartRef.current.data = { datasets };
      chartRef.current.options = options;
      chartRef.current.update();
    } else {
      chartRef.current = new Chart(canvasRef.current, {
        type: "line",
        data: { datasets },
        options,
      });
    }

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [
    isEmpty,
    isSamplesMode,
    baseData,
    currentData,
    baseLabel,
    currentLabel,
    baseColor,
    currentColor,
    metric,
    unit,
  ]);

  const visibleLabels = [
    ...(baseData.length > 0 ? [{ label: baseLabel, color: baseColor }] : []),
    ...(currentData.length > 0 ? [{ label: currentLabel, color: currentColor }] : []),
  ];

  return (
    <div ref={wrapperRef} class={["bk-chart-panel", className].filter(Boolean).join(" ")}>
      {(title || subtitle) && (
        <div class="bk-chart-panel__header">
          <div>
            {title && <h3 class="bk-chart-panel__title">{title}</h3>}
            {subtitle && <p class="bk-chart-panel__subtitle">{subtitle}</p>}
          </div>
        </div>
      )}

      {visibleLabels.length > 1 && (
        <div class="bk-chart-legend">
          {visibleLabels.map(({ label, color }) => (
            <span key={label} class="bk-chart-legend__item">
              <span class="bk-chart-legend__swatch" style={{ background: color }} />
              <span class="bk-chart-legend__label">{label}</span>
            </span>
          ))}
        </div>
      )}

      <div class="bk-chart-panel__canvas" style={{ height: `${height}px` }}>
        {isEmpty ? (
          <div class="bk-chart-panel__empty">
            <div>
              <strong>No data to display.</strong>
              <div>Provide baseSamples/currentSamples or basePoints/currentPoints.</div>
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={title ?? `Comparison chart for ${metric}`}
          >
            Comparison chart for {title ?? metric}
          </canvas>
        )}
      </div>
    </div>
  );
}
