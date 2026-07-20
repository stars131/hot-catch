import type {
  HotspotStatus,
  HotspotTopic,
  HotspotTrendEvidence,
  HotspotTrendWindow,
} from "@/lib/hotspots/hotspot-service";

const WINDOW_HOURS: Record<HotspotTrendWindow, number> = {
  "1h": 1,
  "24h": 24,
  "7d": 24 * 7,
};

const MAX_TREND_POINTS = 48;

export type HotspotObservationPoint = {
  observedAt: Date;
  heat: number;
  topicRank: number;
  sourceCount: number;
};

export function buildHotspotTrendWindows(input: {
  firstObservedAt: Date;
  points: HotspotObservationPoint[];
  now: Date;
}): Record<HotspotTrendWindow, HotspotTrendEvidence> {
  const points = dedupeAndSortPoints(input.points);
  return {
    "1h": buildWindowEvidence("1h", input.firstObservedAt, points, input.now),
    "24h": buildWindowEvidence("24h", input.firstObservedAt, points, input.now),
    "7d": buildWindowEvidence("7d", input.firstObservedAt, points, input.now),
  };
}

export function selectHotspotTrendWindow(
  topic: HotspotTopic,
  window: HotspotTrendWindow,
): HotspotTopic {
  const evidence = topic.trendWindows?.[window] ?? topic.trendEvidence;
  if (!evidence) return topic;
  return {
    ...topic,
    change: evidence.heatChangePercent,
    status: evidence.status,
    predictedPeak: evidence.observedPeak,
    peakEta: evidence.durationLabel,
    trend: evidence.points,
    trendEvidence: evidence,
  };
}

function buildWindowEvidence(
  window: HotspotTrendWindow,
  firstObservedAt: Date,
  points: HotspotObservationPoint[],
  now: Date,
): HotspotTrendEvidence {
  const windowHours = WINDOW_HOURS[window];
  const startAt = now.getTime() - windowHours * 60 * 60 * 1_000;
  const baselineFloor = startAt - windowHours * 60 * 60 * 1_000;
  const inside = points.filter((point) => point.observedAt.getTime() >= startAt);
  const baseline = [...points]
    .reverse()
    .find((point) => {
      const observedAt = point.observedAt.getTime();
      return observedAt < startAt && observedAt >= baselineFloor;
    });
  const selected = baseline ? [baseline, ...inside] : inside;
  const fallback = points.at(-1);
  const usable = selected.length ? selected : fallback ? [fallback] : [];
  const first = usable[0];
  const latest = usable.at(-1);
  const dataState = usable.length >= 2 ? "observed" : "first_seen";
  const heatChangePercent = first && latest
    ? percentageChange(first.heat, latest.heat)
    : 0;
  const rankChange = dataState === "observed" && first && latest
    ? first.topicRank - latest.topicRank
    : null;
  const observedPeak = usable.length
    ? Math.max(...usable.map((point) => point.heat))
    : 0;
  const status = latest
    ? inferObservedStatus({
        dataState,
        heat: latest.heat,
        heatChangePercent,
        rankChange,
        sourceCount: latest.sourceCount,
      })
    : "观望";

  return {
    dataState,
    window,
    windowHours,
    observationCount: usable.length,
    firstObservedAt: firstObservedAt.toISOString(),
    lastObservedAt: (latest?.observedAt ?? now).toISOString(),
    heatChangePercent,
    rankChange,
    observedPeak,
    isNew: firstObservedAt.getTime() >= startAt,
    durationLabel: formatDuration(firstObservedAt, now),
    status,
    points: downsample(usable.map((point) => point.heat), MAX_TREND_POINTS),
  };
}

function inferObservedStatus(input: {
  dataState: HotspotTrendEvidence["dataState"];
  heat: number;
  heatChangePercent: number;
  rankChange: number | null;
  sourceCount: number;
}): HotspotStatus {
  if (input.dataState === "first_seen") return "观望";
  if (
    input.heat >= 75
    && input.sourceCount >= 2
    && input.heatChangePercent >= 15
  ) {
    return "爆发中";
  }
  if (input.heatChangePercent >= 3 || (input.rankChange ?? 0) >= 3) return "上升";
  if (input.heatChangePercent <= -3 || (input.rankChange ?? 0) <= -3) return "回落";
  return "观望";
}

function percentageChange(previous: number, current: number) {
  if (!Number.isFinite(previous) || previous === 0 || !Number.isFinite(current)) return 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function formatDuration(firstObservedAt: Date, now: Date) {
  const elapsedHours = Math.max(0, (now.getTime() - firstObservedAt.getTime()) / 3_600_000);
  if (elapsedHours < 1) return "首次记录";
  if (elapsedHours < 24) return `持续 ${Math.max(1, Math.floor(elapsedHours))} 小时`;
  return `持续 ${Math.max(1, Math.floor(elapsedHours / 24))} 天`;
}

function dedupeAndSortPoints(points: HotspotObservationPoint[]) {
  const byTime = new Map<number, HotspotObservationPoint>();
  for (const point of points) {
    byTime.set(point.observedAt.getTime(), point);
  }
  return [...byTime.values()].sort(
    (left, right) => left.observedAt.getTime() - right.observedAt.getTime(),
  );
}

function downsample(points: number[], maxPoints: number) {
  if (points.length <= maxPoints) return points;
  const sampled: number[] = [];
  const lastIndex = points.length - 1;
  for (let index = 0; index < maxPoints; index += 1) {
    sampled.push(points[Math.round((index / (maxPoints - 1)) * lastIndex)]);
  }
  return sampled;
}
