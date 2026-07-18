import { describe, expect, it } from "vitest";
import { MockAiToEarnProvider, MockAiToEarnStore } from "@/lib/providers/aitoearn/mock-provider";
import { normalizeMetrics } from "@/lib/metrics/normalizer";

/**
 * C11 契约：mock 供应商的作品指标必须是确定性夹具数据，
 * 永远带 simulated/source 标记，且能被 normalizeMetrics 归一化。
 */
describe("MockAiToEarnProvider.getWorkAnalytics", () => {
  const provider = new MockAiToEarnProvider(new MockAiToEarnStore());

  it("returns deterministic fixture analytics with explicit simulation labels", async () => {
    const first = await provider.getWorkAnalytics("douyin", "mock-work-1");
    const second = await provider.getWorkAnalytics("douyin", "mock-work-1");
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      simulated: true,
      source: "mock-fixture",
      provider: "aitoearn-mock",
      platform: "douyin",
      platformWorkId: "mock-work-1",
    });
  });

  it("varies by work id and normalizes into the domain metric shape", async () => {
    const a = normalizeMetrics(await provider.getWorkAnalytics("xiaohongshu", "mock-work-a"));
    const b = normalizeMetrics(await provider.getWorkAnalytics("xiaohongshu", "mock-work-b"));
    expect(a.viewCount).toBeGreaterThan(0);
    expect(a.likeCount).toBeGreaterThan(0);
    expect([a.viewCount, a.likeCount, a.collectCount]).not.toEqual([
      b.viewCount,
      b.likeCount,
      b.collectCount,
    ]);
  });

  it("only exposes platformWorkId on records forced into the published fixture state", async () => {
    const store = new MockAiToEarnStore();
    const isolated = new MockAiToEarnProvider(store);
    const created = await isolated.createFlow({
      platform: "douyin",
      accountId: "mock-douyin-active",
      idempotencyKey: "analytics-contract-1",
      payload: {},
    });
    const inFlight = await isolated.getRecord(created.recordId);
    expect((inFlight.raw as Record<string, unknown>).platformWorkId).toBeUndefined();

    store.records.get(created.recordId)!.status = "published";
    const published = await isolated.getRecord(created.recordId);
    expect((published.raw as Record<string, unknown>).platformWorkId).toBe(
      `mock-work-${created.recordId}`,
    );
  });
});
