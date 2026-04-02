import { useRef, useEffect, useMemo } from "preact/hooks";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import type { Sample } from "@benchkit/format";
import { COLORS } from "../colors.js";
import { getChartTheme } from "../theme.js";
import { extractSampleMetrics } from "../sample-utils.js";

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Legend);

export interface SampleChartProps {
  /** Intra-run time-series data points. */
  samples: Sample[];
  /** Metric keys to plot. Defaults to all keys found in the samples. */
  metrics?: string[];
  height?: number;
  title?: string;
  subtitle?: string;
  /** Compact "sparkline" mode for embedding in summary cards. */
  compact?: boolean;
  /** Stroke width for trend lines. */
  lineWidth?: number;
  /** Custom label for a metric key. */
  metricLabelFormatter?: (metric: string) => string;
  showLegend?: boolean;
  /** CSS class name */
  class?: string;
}

function formatValue(value: number, compact = false): string {
  if (compact) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 0 : 2 });
}

export function SampleChart({
  samples,
  metrics,
  height = 300,
  title,
  subtitle,
  compact = false,
  lineWidth,
  metricLabelFormatter,
  showLegend = true,
  class: className,
}: SampleChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const resolvedMetrics = useMemo(() => {
    if (metrics && metrics.length > 0) return metrics;
    return extractSampleMetrics(samples);
  }, [samples, metrics]);

  const datasets = useMemo<ChartData<"line">["datasets"]>(() => {
    return resolvedMetrics.map((metric, idx) => {
      const color = COLORS[idx % COLORS.length];
      const label = metricLabelFormatter ? metricLabelFormatter(metric) : metric;
      return {
        label,
        data: samples.map((s) => ({ x: s.t, y: s[metric] ?? null })),
        borderColor: color,
        backgroundColor: `${color}22`,
        fill: resolvedMetrics.length === 1,
        tension: 0,
        borderWidth: lineWidth ?? (compact ? 1.5 : 1.75),
        clip: 8,
        spanGaps: true,
        pointRadius: compact ? 1.75 : 2.5,
        pointHoverRadius: compact ? 4 : 6,
        pointBackgroundColor: color,
        pointBorderColor: color,
      };
    });
  }, [resolvedMetrics, samples, metricLabelFormatter, compact, lineWidth]);

  useEffect(() => {
    if (!canvasRef.current || !wrapperRef.current) return;

    if (datasets.length === 0 || samples.length === 0) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return;
    }

    const theme = getChartTheme(wrapperRef.current);

    const options: ChartOptions<"line"> = {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          left: compact ? 2 : 4,
          right: compact ? 6 : 8,
          top: compact ? 2 : 4,
          bottom: compact ? 0 : 2,
        },
      },
      interaction: {
        mode: "nearest",
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
            title: (items) => `t = ${items[0]?.label ?? ""}s`,
          },
        },
      },
      scales: {
        x: {
          type: "linear",
          title: {
            display: !compact,
            text: "Elapsed time (s)",
            color: theme.mutedText,
          },
          grid: { color: theme.grid },
          ticks: {
            color: theme.mutedText,
            maxTicksLimit: compact ? 4 : 7,
            callback: (value) => `${value}s`,
          },
          border: { color: theme.border },
        },
        y: {
          title: {
            display: !compact && resolvedMetrics.length === 1,
            text: resolvedMetrics[0] ?? "",
            color: theme.mutedText,
          },
          beginAtZero: false,
          grid: { color: theme.grid },
          ticks: {
            color: theme.mutedText,
            maxTicksLimit: compact ? 4 : 6,
            callback: (value) => formatValue(Number(value), compact),
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
  }, [compact, datasets, samples.length, resolvedMetrics]);

  const isEmpty = samples.length === 0 || resolvedMetrics.length === 0;

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

      {showLegend && !compact && resolvedMetrics.length > 1 && (
        <div class="bk-chart-legend">
          {resolvedMetrics.map((metric, idx) => {
            const color = COLORS[idx % COLORS.length];
            const label = metricLabelFormatter ? metricLabelFormatter(metric) : metric;
            return (
              <span key={metric} class="bk-chart-legend__item" title={label}>
                <span class="bk-chart-legend__swatch" style={{ background: color }} />
                <span class="bk-chart-legend__label">{label}</span>
              </span>
            );
          })}
        </div>
      )}

      <div class="bk-chart-panel__canvas" style={{ height: `${height}px` }}>
        {isEmpty ? (
          <div class="bk-chart-panel__empty">
            <div>
              <strong>No sample data.</strong>
              <div>No intra-run time-series samples are available for this benchmark.</div>
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={title ?? "Sample chart"}
          >
            {title ?? "Sample chart"}
          </canvas>
        )}
      </div>
    </div>
  );
}
