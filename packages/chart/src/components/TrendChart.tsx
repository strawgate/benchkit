import { useRef, useEffect } from "preact/hooks";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import "chartjs-adapter-date-fns";
import type { SeriesFile, SeriesEntry } from "@benchkit/format";
import { COLORS } from "../colors.js";
import type { RegressionResult } from "../utils.js";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Legend,
  Filler,
);

export interface TrendChartProps {
  series: SeriesFile;
  height?: number;
  title?: string;
  /** Max points per series to display (default: all) */
  maxPoints?: number;
  /** Custom series name renderer */
  seriesNameFormatter?: (name: string, entry: SeriesEntry) => string;
  /** CSS class name */
  class?: string;
  /** Regression results to highlight on the chart (last data point of each flagged series). */
  regressions?: RegressionResult[];
}

export function TrendChart({ series, height = 300, title, maxPoints, seriesNameFormatter, class: className, regressions }: TrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const labels: string[] = [];
    const labelSet = new Set<string>();
    const datasets: ChartData<"line">["datasets"] = [];

    const entries = Object.entries(series.series);
    entries.forEach(([name, entry], idx) => {
      let pts = entry.points;
      if (maxPoints && pts.length > maxPoints) {
        pts = pts.slice(-maxPoints);
      }

      for (const p of pts) {
        if (!labelSet.has(p.timestamp)) {
          labelSet.add(p.timestamp);
          labels.push(p.timestamp);
        }
      }

      const color = COLORS[idx % COLORS.length];
      const isRegressed = regressions?.some((r) => r.seriesName === name) ?? false;
      const lastIdx = pts.length - 1;

      // Per-point colors: highlight the last point red when it is a regression.
      const pointBackgroundColors = pts.map((_, i) =>
        isRegressed && i === lastIdx ? "#ef4444" : color,
      );
      const pointRadii = pts.map((_, i) =>
        isRegressed && i === lastIdx ? 6 : 3,
      );
      const pointBorderColors = pts.map((_, i) =>
        isRegressed && i === lastIdx ? "#b91c1c" : color,
      );

      datasets.push({
        label: seriesNameFormatter ? seriesNameFormatter(name, entry) : name,
        data: pts.map((p) => ({ x: p.timestamp as unknown as number, y: p.value })),
        borderColor: color,
        backgroundColor: color + "20",
        fill: entries.length === 1,
        tension: 0.3,
        pointRadius: pointRadii,
        pointHoverRadius: 6,
        pointBackgroundColor: pointBackgroundColors,
        pointBorderColor: pointBorderColors,
      });
    });

    labels.sort();

    const options: ChartOptions<"line"> = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: entries.length > 1 },
        tooltip: {
          callbacks: {
            title: (items) => {
              const ts = items[0]?.label;
              return ts ? new Date(ts).toLocaleString() : "";
            },
            afterLabel: (item) => {
              const entry = entries[item.datasetIndex];
              if (!entry) return "";
              const pt = entry[1].points[item.dataIndex];
              const parts: string[] = [];
              if (pt?.commit) parts.push(`commit: ${pt.commit.slice(0, 8)}`);
              if (pt?.range != null) parts.push(`± ${pt.range}`);
              return parts.join("\n");
            },
          },
        },
      },
      scales: {
        x: {
          type: "time" as const,
          time: { tooltipFormat: "PPpp" },
          title: { display: false },
        },
        y: {
          title: {
            display: true,
            text: series.unit ?? series.metric,
          },
          beginAtZero: false,
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
  }, [series, maxPoints, seriesNameFormatter, regressions]);

  return (
    <div class={className} style={{ position: "relative", height: `${height}px` }}>
      {title && <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>{title}</h3>}
      <canvas ref={canvasRef} />
    </div>
  );
}
