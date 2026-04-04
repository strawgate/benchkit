export function getFetchFailureMessage(dataBranch: string, stderr: string): string | undefined {
  if (
    stderr.includes("refusing to fetch into branch")
    && stderr.includes("checked out")
  ) {
    return (
      `Cannot aggregate: '${dataBranch}' is already checked out at the current working directory. `
      + `Remove the 'ref: ${dataBranch}' input from your actions/checkout step — `
      + "the aggregate action fetches the data branch into its own worktree."
    );
  }
  return undefined;
}
