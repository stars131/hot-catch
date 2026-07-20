import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type {
  HotspotPayload,
  HotspotTrendEvidence,
  HotspotTrendWindow,
} from "@/lib/hotspots/hotspot-service";
import { enrichHotspotPayloadWithHistory } from "@/lib/hotspots/trend-history-service";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userAId = "";
let userBId = "";

beforeAll(async () => {
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `hotspot-history-a-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `hotspot-history-b-${runId}@example.com` } }),
  ]);
  userAId = userA.id;
  userBId = userB.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("per-user hotspot trend history", () => {
  it("records real changes and keeps another user's history isolated", async () => {
    const firstAt = new Date("2026-07-20T08:00:00.000Z");
    const secondAt = new Date("2026-07-20T10:00:00.000Z");

    const first = await enrichHotspotPayloadWithHistory(
      userAId,
      makePayload(50, 1),
      { now: firstAt },
    );
    expect(first.topics[0].trendEvidence.dataState).toBe("first_seen");

    const second = await enrichHotspotPayloadWithHistory(
      userAId,
      makePayload(80, 3),
      { now: secondAt },
    );
    expect(second.topics[0].trendEvidence).toMatchObject({
      dataState: "observed",
      heatChangePercent: 60,
      observedPeak: 80,
      status: "爆发中",
    });

    const isolated = await enrichHotspotPayloadWithHistory(
      userBId,
      makePayload(80, 3),
      { now: secondAt },
    );
    expect(isolated.topics[0].trendEvidence).toMatchObject({
      dataState: "first_seen",
      heatChangePercent: 0,
      observationCount: 1,
    });

    expect(await prisma.hotspotTrendObservation.count({ where: { userId: userAId } })).toBe(2);
    expect(await prisma.hotspotTrendObservation.count({ where: { userId: userBId } })).toBe(1);
  });
});

function makePayload(heat: number, sourceCount: number): HotspotPayload {
  const evidence = initialEvidence(heat);
  return {
    generatedAt: new Date().toISOString(),
    platforms: ["全平台", "微博"],
    topics: [{
      id: `trend-${runId}`,
      title: "测试真实趋势",
      category: "科技与AI",
      platform: "微博",
      heat,
      change: 0,
      status: "观望",
      predictedPeak: heat,
      peakEta: "首次记录",
      notes: sourceCount,
      engagement: "1万",
      creators: `${sourceCount} 个平台`,
      related: 1,
      trend: [heat],
      trendEvidence: evidence["24h"],
      trendWindows: evidence,
      platformShare: [{ label: "微博", value: 100, color: "#000000" }],
      angles: [],
      riskNotes: [],
      keywords: ["测试"],
      sources: Array.from({ length: sourceCount }, (_, index) => ({
        id: `source-${index}`,
        title: "测试真实趋势",
        url: `https://example.com/${index}`,
        score: 100 - index,
        rawScore: String(100 - index),
        desc: "",
        platform: index === 0 ? "微博" : "知乎",
        platformCode: index === 0 ? "weibo" : "zhihu",
        rank: index + 1,
        backend: `fixture-${index}`,
      })),
    }],
    sourceHealth: [],
    sourceCatalog: [],
    projectReferences: [],
    summary: {
      totalItems: sourceCount,
      activeSources: sourceCount,
      crossPlatformTopics: sourceCount > 1 ? 1 : 0,
      backendCount: sourceCount,
      credentialFreeSourceCount: sourceCount,
      optionalConnectionSourceCount: 0,
      cookieSourceCount: 0,
      cookieConfiguredCount: 0,
      projectReferenceCount: 0,
      source: "integration fixture",
    },
  };
}

function initialEvidence(heat: number): Record<HotspotTrendWindow, HotspotTrendEvidence> {
  const create = (window: HotspotTrendWindow, windowHours: number): HotspotTrendEvidence => ({
    dataState: "first_seen",
    window,
    windowHours,
    observationCount: 1,
    firstObservedAt: new Date().toISOString(),
    lastObservedAt: new Date().toISOString(),
    heatChangePercent: 0,
    rankChange: null,
    observedPeak: heat,
    isNew: true,
    durationLabel: "首次记录",
    status: "观望",
    points: [heat],
  });
  return {
    "1h": create("1h", 1),
    "24h": create("24h", 24),
    "7d": create("7d", 168),
  };
}
