import { describe, expect, it } from "vitest";
import { MetricWindow, type MetricSnapshot, type PublishStatus } from "@prisma/client";
import { computeOutcome, shouldProposeRule } from "@/lib/metrics/retro-math";
import {
  buildMetricTimeline,
  computeMetricWindows,
  resolveMetricsAvailability,
  toPublicMetricSnapshot,
} from "@/lib/services/performance-service";

/** C11 指标与复盘地基单元测试：窗口计算、可用性判定、偏差计算与三次误判守卫。 */

const PUBLISHED_AT = new Date("2026-07-01T10:00:00.000Z");

function fakeSnapshot(overrides: Partial<MetricSnapshot> = {}): MetricSnapshot {
  return {
    id: "snap-1",
    userId: "user-1",
    publishRecordId: "rec-1",
    window: MetricWindow.d1,
    observedAt: new Date("2026-07-02T10:05:00.000Z"),
    viewCount: 1000,
    likeCount: 80,
    collectCount: 30,
    commentCount: 10,
    shareCount: 5,
    followerDelta: 2,
    rawData: { source: "mock-fixture", simulated: true },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as MetricSnapshot;
}

describe("computeMetricWindows", () => {
  it("derives D+1/D+3/D+7 due times from the real publish time", () => {
    const windows = computeMetricWindows(PUBLISHED_AT);
    expect(windows.map((item) => item.window)).toEqual([
      MetricWindow.d1,
      MetricWindow.d3,
      MetricWindow.d7,
    ]);
    expect(windows[0].dueAt.toISOString()).toBe("2026-07-02T10:00:00.000Z");
    expect(windows[1].dueAt.toISOString()).toBe("2026-07-04T10:00:00.000Z");
    expect(windows[2].dueAt.toISOString()).toBe("2026-07-08T10:00:00.000Z");
  });
});

describe("resolveMetricsAvailability", () => {
  const cases: Array<[PublishStatus, string]> = [
    ["draft", "waiting_publish"],
    ["scheduled", "waiting_publish"],
    ["uploading", "provider_processing"],
    ["submitted", "provider_processing"],
    ["awaiting_user", "awaiting_user"],
    ["failed", "publish_failed"],
    ["canceled", "publish_canceled"],
  ];
  it.each(cases)("%s → unavailable with reason %s and a readable message", (status, reason) => {
    const availability = resolveMetricsAvailability({ status, publishedAt: null });
    expect(availability).toMatchObject({ available: false, reason });
    if (!availability.available) expect(availability.message.length).toBeGreaterThan(5);
  });

  it("is available only for published records with a publish time", () => {
    expect(
      resolveMetricsAvailability({ status: "published", publishedAt: PUBLISHED_AT }),
    ).toEqual({ available: true });
    expect(
      resolveMetricsAvailability({ status: "published", publishedAt: null }),
    ).toMatchObject({ available: false, reason: "missing_published_at" });
  });
});

describe("buildMetricTimeline", () => {
  it("marks collected, due, and scheduled windows explicitly", () => {
    const now = new Date("2026-07-05T10:00:00.000Z"); // d1/d3 已到期, d7 未到
    const timeline = buildMetricTimeline(PUBLISHED_AT, [fakeSnapshot()], now);
    expect(timeline[0]).toMatchObject({ window: "d1", status: "collected" });
    expect(timeline[0].snapshot?.dataSource).toBe("mock-fixture");
    expect(timeline[1]).toMatchObject({ window: "d3", status: "due", snapshot: null });
    expect(timeline[2]).toMatchObject({ window: "d7", status: "scheduled", snapshot: null });
  });
});

describe("toPublicMetricSnapshot", () => {
  it("labels mock fixtures and never leaks the raw provider payload", () => {
    const snapshot = toPublicMetricSnapshot(
      fakeSnapshot({ rawData: { simulated: true, payload: { secret: "raw" } } }),
    );
    expect(snapshot.dataSource).toBe("mock-fixture");
    expect(JSON.stringify(snapshot)).not.toContain("secret");
  });

  it("labels provider data when no simulation markers exist", () => {
    const snapshot = toPublicMetricSnapshot(fakeSnapshot({ rawData: { data: { views: 12 } } }));
    expect(snapshot.dataSource).toBe("provider");
  });
});

describe("computeOutcome", () => {
  it("computes outcome score, delta and direction", () => {
    // engagement = 80*2+30*3+10*3+5*4 = 300 → 300/1000*1000 = 300 → capped 100
    const capped = computeOutcome(
      { viewCount: 1000, likeCount: 80, collectCount: 30, commentCount: 10, shareCount: 5 },
      70,
    );
    expect(capped.outcomeScore).toBe(100);
    expect(capped.delta).toBe(30);
    expect(capped.direction).toBe("underestimated");

    // engagement = 20*2 = 40 → 40/10000*1000 = 4
    const low = computeOutcome({ viewCount: 10000, likeCount: 20 }, 60);
    expect(low.outcomeScore).toBe(4);
    expect(low.direction).toBe("overestimated");

    const aligned = computeOutcome({ viewCount: 1000, likeCount: 30 }, 55);
    expect(aligned.outcomeScore).toBe(60);
    expect(aligned.direction).toBe("aligned");
  });

  it("guards against zero views", () => {
    expect(computeOutcome({}, 0).outcomeScore).toBe(0);
  });
});

describe("shouldProposeRule (三次同方向误判守卫)", () => {
  it("requires exactly 3 identical non-aligned directions", () => {
    expect(shouldProposeRule(["overestimated", "overestimated", "overestimated"])).toBe(true);
    expect(shouldProposeRule(["underestimated", "underestimated", "underestimated"])).toBe(true);
  });

  it("rejects aligned, mixed, short, or long histories", () => {
    expect(shouldProposeRule(["aligned", "aligned", "aligned"])).toBe(false);
    expect(shouldProposeRule(["overestimated", "underestimated", "overestimated"])).toBe(false);
    expect(shouldProposeRule(["overestimated", "overestimated"])).toBe(false);
    expect(shouldProposeRule(["overestimated", "overestimated", "overestimated", "overestimated"]),
    ).toBe(false);
    expect(shouldProposeRule(["overestimated", "overestimated", ""])).toBe(false);
  });
});
