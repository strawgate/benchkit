import type { IndexFile, RunEntry } from "@benchkit/format";

export interface RunTableProps {
  index: IndexFile;
  maxRows?: number;
  onSelectRun?: (runId: string) => void;
  /** Link commits to GitHub or other VCS */
  commitHref?: (commit: string, run: RunEntry) => string | undefined;
  class?: string;
}

export function RunTable({ index, maxRows, onSelectRun, commitHref, class: className }: RunTableProps) {
  const runs = maxRows ? index.runs.slice(0, maxRows) : index.runs;

  return (
    <table class={className} style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
      <thead>
        <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
          <th style={thStyle}>Run</th>
          <th style={thStyle}>Time</th>
          <th style={thStyle}>Commit</th>
          <th style={thStyle}>Ref</th>
          <th style={thStyle}>Benchmarks</th>
          <th style={thStyle}>Metrics</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr
            key={run.id}
            style={{ borderBottom: "1px solid #f3f4f6", cursor: onSelectRun ? "pointer" : "default" }}
            onClick={() => onSelectRun?.(run.id)}
          >
            <td style={tdStyle}>
              <code style={{ fontSize: "12px" }}>{run.id}</code>
            </td>
            <td style={tdStyle}>{formatTime(run.timestamp)}</td>
            <td style={tdStyle}>
              {run.commit ? (
                (() => {
                  const href = commitHref?.(run.commit, run);
                  const code = <code style={{ fontSize: "12px" }}>{run.commit.slice(0, 8)}</code>;
                  return href ? <a href={href} target="_blank" rel="noopener noreferrer">{code}</a> : code;
                })()
              ) : (
                "—"
              )}
            </td>
            <td style={tdStyle}>{run.ref?.replace("refs/heads/", "") ?? "—"}</td>
            <td style={{ ...tdStyle, textAlign: "right" }}>{run.benchmarks ?? "—"}</td>
            <td style={tdStyle}>{run.metrics?.join(", ") ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const thStyle: Record<string, string> = {
  padding: "8px 12px",
  fontWeight: "600",
};

const tdStyle: Record<string, string> = {
  padding: "6px 12px",
};

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}
