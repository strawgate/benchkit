import { useRef, useEffect, useMemo } from "preact/hooks";
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  type ChartOptions,
} from "chart.js";
import type { SeriesFile, SeriesEntry } from "@benchkit/format";
import { COLORS } from "../colors.js";
import { getChartTheme } from "../theme.js";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export interface ComparisonBarProps {
  series: SeriesFile;
  height?: number;
  title?: string;
  subtitle?: string;
  /** Custom series name renderer */
  seriesNameFormatter?: (name: string, entry: SeriesEntry) => string;
  showValuesList?: boolean;
  class?: string;
}

function formatValue(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: value >= 100 ? 0 : 2 });
}

export function ComparisonBar({
  series,
  height = 250,
  title,
  subtitle,
  seriesNameFormatter,
  showValuesList = false,
  class: className,
}: ComparisonBarProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const entries = useMemo(() => {
    return Object.entries(series.series)
      .map(([name, entry], idx) => {
        const latest = entry.points[entry.points.length - 1];
        if (!latest) return null;
        return {
          name,
          label: seriesNameFormatter ? seriesNameFormatter(name, entry) : name,
          latest,
          color: COLORS[idx % COLORS.length],
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [series, seriesNameFormatter]);

  useEffect(() => {
    if (!canvasRef.current || !wrapperRef.current) return;

    if (entries.length === 0) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return;
    }

    const theme = getChartTheme(wrapperRef.current);
    const names = entries.map((entry) => entry.label);
    const values = entries.map((entry) => entry.latest.value);
    const errors = entries.map((entry) => entry.latest.range ?? null);
    const colors = entries.map((entry) => entry.color);

    const options: ChartOptions<"bar"> = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: names.length > 4 ? "y" : "x",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: theme.tooltipBackground,
          borderColor: theme.tooltipBorder,
          borderWidth: 1,
          titleColor: theme.tooltipTitle,
          bodyColor: theme.tooltipBody,
          padding: 12,
          callbacks: {
            label: (item) => {
              const v = values[item.dataIndex];
              const e = errors[item.dataIndex];
              const unit = series.unit ?? "";
              return e != null ? `${v} ± ${e} ${unit}` : `${v} ${unit}`;
            },
          },
        },
      },
      scales: {
        value: {
          axis: names.length > 4 ? "x" : "y",
          title: {
            display: true,
            text: series.unit ?? series.metric,
            color: theme.mutedText,
          },
          beginAtZero: true,
          grid: {
            color: theme.grid,
          },
          ticks: {
            color: theme.mutedText,
            callback: (value) => formatValue(Number(value)),
          },
          border: {
            color: theme.border,
          },
        },
        label: {
          axis: names.length > 4 ? "y" : "x",
          grid: {
            display: false,
          },
          ticks: {
            color: theme.mutedText,
          },
          border: {
            color: theme.border,
          },
        },
      },
    };

    const data = {
      labels: names,
      datasets: [
        {
          data: values,
          backgroundColor: colors.map((c) => c + "80"),
          borderColor: colors,
          borderWidth: 1.5,
          borderRadius: 8,
          clip: 8,
        },
      ],
    };

    if (chartRef.current) {
      chartRef.current.data = data;
      chartRef.current.options = options;
      chartRef.current.update();
    } else {
      chartRef.current = new Chart(canvasRef.current, {
        type: "bar",
        data,
        options,
      });
    }

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [entries, series.metric, series.unit]);

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

      <div class="bk-chart-panel__canvas" style={{ height: `${height}px` }}>
        {entries.length === 0 ? (
          <div class="bk-chart-panel__empty">
            <div>
              <strong>No latest values available.</strong>
              <div>The selected metric has no visible series after filtering.</div>
            </div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={title ?? `Latest comparison for ${series.metric}`}
          >
            Latest comparison for {title ?? series.metric}
          </canvas>
        )}
      </div>

      {showValuesList && entries.length > 0 && (
        <div class="bk-list">
          {entries.map((entry) => (
            <div key={entry.name} class="bk-list__row">
              <span class="bk-chart-legend__item" title={entry.label}>
                <span class="bk-chart-legend__swatch" style={{ background: entry.color }} />
                <span class="bk-chart-legend__label">{entry.label}</span>
              </span>
              <span class="bk-list__value">
                {formatValue(entry.latest.value)} {series.unit ?? ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
