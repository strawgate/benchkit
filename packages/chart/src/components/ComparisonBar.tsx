import { useRef, useEffect } from "preact/hooks";
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
import type { SeriesFile } from "@benchkit/format";

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export interface ComparisonBarProps {
  series: SeriesFile;
  height?: number;
  title?: string;
  class?: string;
}

const COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#6366f1",
];

export function ComparisonBar({ series, height = 250, title, class: className }: ComparisonBarProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart<"bar"> | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const names: string[] = [];
    const values: number[] = [];
    const errors: (number | null)[] = [];
    const colors: string[] = [];

    const entries = Object.entries(series.series);
    entries.forEach(([name, entry], idx) => {
      const latest = entry.points[entry.points.length - 1];
      if (!latest) return;
      names.push(name);
      values.push(latest.value);
      errors.push(latest.range ?? null);
      colors.push(COLORS[idx % COLORS.length]);
    });

    const options: ChartOptions<"bar"> = {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: names.length > 6 ? "y" : "x",
      plugins: {
        legend: { display: false },
        tooltip: {
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
          axis: names.length > 6 ? "x" : "y",
          title: { display: true, text: series.unit ?? series.metric },
          beginAtZero: true,
        },
        label: {
          axis: names.length > 6 ? "y" : "x",
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
          borderWidth: 1,
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
  }, [series]);

  return (
    <div class={className} style={{ position: "relative", height: `${height}px` }}>
      {title && <h3 style={{ margin: "0 0 8px", fontSize: "14px" }}>{title}</h3>}
      <canvas ref={canvasRef} />
    </div>
  );
}
