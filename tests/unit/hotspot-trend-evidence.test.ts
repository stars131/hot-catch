import { describe, expect, it } from "vitest";
import { buildHotspotTrendWindows } from "@/lib/hotspots/trend-evidence";

const NOW = new Date("2026-07-20T12:00:00.000Z");

describe("hotspot trend evidence", () => {
  it("marks a first observation without manufacturing a trend", () => {
    const windows = buildHotspotTrendWindows({
      firstObservedAt: NOW,
      now: NOW,
      points: [{ observedAt: NOW, heat: 82, topicRank: 4, sourceCount: 2 }],
    });

    expect(windows["1h"]).toMatchObject({
      dataState: "first_seen",
      observationCount: 1,
      heatChangePercent: 0,
      rankChange: null,
      observedPeak: 82,
      status: "观望",
      points: [82],
    });
    expect(windows["24h"].points).toEqual([82]);
    expect(windows["7d"].points).toEqual([82]);
  });

  it("derives each time window from saved observations", () => {
    const windows = buildHotspotTrendWindows({
      firstObservedAt: new Date("2026-07-18T12:00:00.000Z"),
      now: NOW,
      points: [
        { observedAt: new Date("2026-07-18T12:00:00.000Z"), heat: 40, topicRank: 30, sourceCount: 1 },
        { observedAt: new Date("2026-07-20T00:00:00.000Z"), heat: 80, topicRank: 5, sourceCount: 2 },
        { observedAt: new Date("2026-07-20T11:30:00.000Z"), heat: 80, topicRank: 5, sourceCount: 2 },
        { observedAt: NOW, heat: 76, topicRank: 7, sourceCount: 2 },
      ],
    });

    expect(windows["1h"]).toMatchObject({
      dataState: "observed",
      heatChangePercent: -5,
      rankChange: -2,
      observedPeak: 80,
      status: "回落",
      isNew: false,
    });
    expect(windows["24h"]).toMatchObject({
      heatChangePercent: 90,
      rankChange: 23,
      observedPeak: 80,
      status: "爆发中",
    });
    expect(windows["7d"]).toMatchObject({
      heatChangePercent: 90,
      rankChange: 23,
      status: "爆发中",
    });
  });

  it("caps long histories while retaining the first and latest values", () => {
    const points = Array.from({ length: 200 }, (_, index) => ({
      observedAt: new Date(NOW.getTime() - (199 - index) * 30 * 60 * 1_000),
      heat: 40 + index,
      topicRank: 200 - index,
      sourceCount: 2,
    }));
    const evidence = buildHotspotTrendWindows({
      firstObservedAt: points[0].observedAt,
      now: NOW,
      points,
    })["7d"];

    expect(evidence.points).toHaveLength(48);
    expect(evidence.points[0]).toBe(40);
    expect(evidence.points.at(-1)).toBe(239);
  });

  it("does not use a stale point as a short-window baseline", () => {
    const evidence = buildHotspotTrendWindows({
      firstObservedAt: new Date("2026-07-18T12:00:00.000Z"),
      now: NOW,
      points: [
        { observedAt: new Date("2026-07-18T12:00:00.000Z"), heat: 40, topicRank: 20, sourceCount: 1 },
        { observedAt: NOW, heat: 80, topicRank: 4, sourceCount: 2 },
      ],
    })["1h"];

    expect(evidence).toMatchObject({
      dataState: "first_seen",
      isNew: false,
      heatChangePercent: 0,
      rankChange: null,
      points: [80],
    });
  });
});
