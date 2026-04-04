/**
 * Format a git ref for display.
 *
 * Converts `refs/pull/N/merge` → `PR #N`, strips `refs/heads/` and
 * `refs/tags/` prefixes. Returns `"—"` for undefined/empty refs.
 */
export function formatRef(ref: string | undefined): string {
  if (!ref) return "—";
  const prMatch = /^refs\/pull\/(\d+)\/merge$/.exec(ref);
  if (prMatch) return `PR #${prMatch[1]}`;
  if (ref.startsWith("refs/heads/")) return ref.replace("refs/heads/", "");
  if (ref.startsWith("refs/tags/")) return `tag ${ref.replace("refs/tags/", "")}`;
  return ref;
}
