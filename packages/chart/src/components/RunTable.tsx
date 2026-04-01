import type { IndexFile, RunEntry } from "@benchkit/format";

export interface RunTableProps {
  index: IndexFile;
  maxRows?: number;
  onSelectRun?: (runId: string) => void;
  /** Link commits to GitHub or other VCS */
  commitHref?: (commit: string, run: RunEntry) => string | undefined;
  class?: string;
}

function formatRef(ref: string | undefined): string {
  if (!ref) return "—";
  if (ref.startsWith("refs/heads/")) return ref.replace("refs/heads/", "");
  const pullMatch = /^refs\/pull\/(\d+)\/merge$/.exec(ref);
  if (pullMatch) return `PR #${pullMatch[1]}`;
  if (ref.startsWith("refs/tags/")) return `tag ${ref.replace("refs/tags/", "")}`;
  return ref;
}

export function RunTable({ index, maxRows, onSelectRun, commitHref, class: className }: RunTableProps) {
  const runs = maxRows ? index.runs.slice(0, maxRows) : index.runs;

  return (
    <div class={["bk-table-shell", className].filter(Boolean).join(" ")}>
      <div class="bk-table-shell__scroll">
        <table class="bk-table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Time</th>
              <th>Commit</th>
              <th>Ref</th>
              <th class="bk-table__numeric">Benchmarks</th>
              <th>Metrics</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr
                key={run.id}
                style={{ cursor: onSelectRun ? "pointer" : "default" }}
                onClick={() => onSelectRun?.(run.id)}
              >
                <td>
                  <code class="bk-code">{run.id}</code>
                </td>
                <td>{formatTime(run.timestamp)}</td>
                <td>
                  {run.commit ? (
                    (() => {
                      const href = commitHref?.(run.commit, run);
                      const code = <code class="bk-code">{run.commit.slice(0, 8)}</code>;
                      return href ? <a href={href} target="_blank" rel="noopener noreferrer">{code}</a> : code;
                    })()
                  ) : (
                    <span class="bk-muted">—</span>
                  )}
                </td>
                <td>{formatRef(run.ref)}</td>
                <td class="bk-table__numeric">{run.benchmarks ?? "—"}</td>
                <td class="bk-muted">{run.metrics?.join(", ") ?? "—"}</td>
              </tr>
            ))}
          </tbody>
          {maxRows && index.runs.length > maxRows && (
            <tfoot>
              <tr>
                <td colSpan={6} class="bk-muted">
                  Showing {maxRows} of {index.runs.length} runs
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

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
