import type { SeriesFile, SeriesEntry } from "@benchkit/format";
import { rankSeries, type RankedEntry } from "../leaderboard.js";

export interface LeaderboardProps {
  series: SeriesFile;
  /** Custom series name renderer */
  seriesNameFormatter?: (name: string, entry: SeriesEntry) => string;
  class?: string;
}

function formatDelta(delta: number | undefined, unit: string | undefined): string {
  if (delta === undefined) return "—";
  const sign = delta > 0 ? "+" : "";
  const abs = Math.abs(delta);
  const formatted = abs >= 1000 || abs === 0
    ? Math.round(delta).toLocaleString("en-US")
    : delta.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${sign}${formatted} ${unit ?? ""}`.trim();
}

function deltaArrow(delta: number | undefined, direction: SeriesFile["direction"]): string {
  if (delta === undefined || delta === 0) return "−";
  const improved =
    direction === "bigger_is_better" ? delta > 0 : delta < 0;
  return improved ? "↑" : "↓";
}

function arrowColor(delta: number | undefined, direction: SeriesFile["direction"]): string {
  if (delta === undefined || delta === 0) return "#6b7280";
  const improved =
    direction === "bigger_is_better" ? delta > 0 : delta < 0;
  return improved ? "#16a34a" : "#dc2626";
}

function rankColor(entry: RankedEntry, direction: SeriesFile["direction"]): string {
  if (!direction) return "#111827";
  return entry.isWinner ? "#16a34a" : "#111827";
}

export function Leaderboard({ series, seriesNameFormatter, class: className }: LeaderboardProps) {
  const ranked = rankSeries(series);

  if (ranked.length === 0) return null;
  if (ranked.length === 1) {
    const [r] = ranked;
    const label = seriesNameFormatter ? seriesNameFormatter(r.name, r.entry) : r.name;
    return (
      <div class={className} style={{ fontSize: "13px", color: "#374151" }}>
        {label}: {r.latestValue} {series.unit ?? ""}
      </div>
    );
  }

  return (
    <div class={className}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "13px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left" }}>
            <th style={{ padding: "4px 8px", color: "#6b7280", fontWeight: 500 }}>#</th>
            <th style={{ padding: "4px 8px", color: "#6b7280", fontWeight: 500 }}>Series</th>
            <th style={{ padding: "4px 8px", color: "#6b7280", fontWeight: 500, textAlign: "right" }}>Latest</th>
            <th style={{ padding: "4px 8px", color: "#6b7280", fontWeight: 500, textAlign: "right" }}>Δ prev</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => {
            const label = seriesNameFormatter ? seriesNameFormatter(r.name, r.entry) : r.name;
            const arrow = deltaArrow(r.delta, series.direction);
            const color = arrowColor(r.delta, series.direction);
            return (
              <tr key={r.name} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "6px 8px", color: rankColor(r, series.direction), fontWeight: r.isWinner ? 700 : 400 }}>
                  {r.rank}
                  {r.isWinner && series.direction ? (
                    <span
                      title="Winner"
                      style={{
                        marginLeft: "4px",
                        fontSize: "10px",
                        background: "#dcfce7",
                        color: "#16a34a",
                        borderRadius: "3px",
                        padding: "1px 4px",
                        verticalAlign: "middle",
                      }}
                    >
                      ★
                    </span>
                  ) : null}
                </td>
                <td style={{ padding: "6px 8px" }}>{label}</td>
                <td style={{ padding: "6px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {r.latestValue} {series.unit ?? ""}
                </td>
                <td style={{ padding: "6px 8px", textAlign: "right", color, fontVariantNumeric: "tabular-nums" }}>
                  {arrow} {formatDelta(r.delta, series.unit)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
