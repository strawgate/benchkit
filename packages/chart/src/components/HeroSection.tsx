import type { RunEntry } from "@benchkit/format";
import { formatRef } from "../format-utils.js";

export interface HeroSectionProps {
  userMetricCount: number;
  runCount: number;
  visibleSeriesCount: number;
  monitorMetricCount: number;
  latestRun: RunEntry | undefined;
}

export function HeroSection({
  userMetricCount,
  runCount,
  visibleSeriesCount,
  monitorMetricCount,
  latestRun,
}: HeroSectionProps) {
  return (
    <section class="bk-hero bk-hero--compact">
      <div class="bk-hero__header bk-hero__header--compact">
        <div>
          <p class="bk-hero__eyebrow">Benchkit dashboard</p>
          <h2 class="bk-hero__title bk-hero__title--compact">Performance overview</h2>
        </div>
        <div class="bk-kpis bk-kpis--compact">
          <div class="bk-kpi">
            <span class="bk-kpi__label">Metrics</span>
            <span class="bk-kpi__value">{userMetricCount}</span>
          </div>
          <div class="bk-kpi">
            <span class="bk-kpi__label">Runs</span>
            <span class="bk-kpi__value">{runCount}</span>
          </div>
          <div class="bk-kpi">
            <span class="bk-kpi__label">Series</span>
            <span class="bk-kpi__value">{visibleSeriesCount}</span>
          </div>
          <div class="bk-kpi">
            <span class="bk-kpi__label">Monitor</span>
            <span class="bk-kpi__value">{monitorMetricCount}</span>
          </div>
        </div>
      </div>
      {latestRun && (
        <p class="bk-hero__body">
          Latest run: <strong>{latestRun.id}</strong>
          {latestRun.ref ? ` on ${formatRef(latestRun.ref)}` : ""}
          {latestRun.commit ? ` at ${latestRun.commit.slice(0, 8)}` : ""}.
        </p>
      )}
    </section>
  );
}
