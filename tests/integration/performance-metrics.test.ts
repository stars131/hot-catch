import { MetricWindow } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { getJobHandler } from "@/lib/jobs/handlers";
import "@/lib/jobs/metrics-handler";
import { saveCredential } from "@/lib/services/credential-service";
import {
  createContentProject,
  createContentRevision,
} from "@/lib/services/content-project-service";
import {
  preparePublishRecord,
  submitPublishRecord,
} from "@/lib/services/publishing-service";
import {
  ensureRetrospective,
  getContentPerformance,
  listDueRetrospectives,
  scheduleMetricJobs,
} from "@/lib/services/performance-service";
import type { MockAiToEarnStore } from "@/lib/providers/aitoearn/mock-provider";

/**
 * C11 指标采集与复盘地基集成测试（PUBLISH_PROVIDER_MODE=mock，绝不联网）。
 *
 * 覆盖：mock 夹具指标采集全链路落库并打 simulated 标签、D+7 复盘偏差生成、
 * 未发布状态显式不可用、D+1/D+3/D+7 调度幂等、跨用户越权隔离。
 */

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const noProgress = async () => {};
let userAId = "";
let userBId = "";
let contentId = "";
let publishedRecordId = "";
let submittedRecordId = "";

function mockStore(): MockAiToEarnStore {
  const store = (globalThis as { __aitoearnMockStore?: MockAiToEarnStore }).__aitoearnMockStore;
  if (!store) throw new Error("mock store not initialised");
  return store;
}

beforeAll(async () => {
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `c11-a-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `c11-b-${runId}@example.com` } }),
  ]);
  userAId = userA.id;
  userBId = userB.id;
  await saveCredential(userAId, "aitoearn", { apiKey: `mock-fixture-key-${runId}` });

  const content = await createContentProject(userAId, {
    platform: "douyin",
    contentKind: "douyin_video_script",
    title: `C11 指标夹具 ${runId}`,
  });
  contentId = content.id;
  await createContentRevision(userAId, contentId, {
    source: "manual",
    title: "C11 指标夹具",
    bodyText: "指标采集验证文案。",
    structuredContent: { shots: [] },
  });

  // 记录 1：夹具强制 published（8 天前），可采集 D+1/D+3/D+7
  const published = await preparePublishRecord(
    userAId,
    {
      contentId,
      accountId: "mock-douyin-active",
      assets: [{ url: "https://assets.example/video.mp4", type: "video" as const }],
    },
    `c11-published-${runId}`,
  );
  await submitPublishRecord(userAId, published.id);
  publishedRecordId = published.id;
  const persisted = await prisma.publishRecord.findUniqueOrThrow({
    where: { id: publishedRecordId },
  });
  // 夹具 published-like 状态：mock 供应商侧与本地记录同时置为 published
  mockStore().records.get(persisted.providerRecordId!)!.status = "published";
  await prisma.publishRecord.update({
    where: { id: publishedRecordId },
    data: {
      status: "published",
      publishedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    },
  });

  // 记录 2：停留在 submitted，用于显式"暂无真实数据"
  const submitted = await preparePublishRecord(
    userAId,
    {
      contentId,
      accountId: "mock-xhs-active",
      assets: [{ url: "https://assets.example/video.mp4", type: "video" as const }],
    },
    `c11-submitted-${runId}`,
  );
  submittedRecordId = submitted.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("metric collection with mock fixtures", () => {
  it("collects a labeled mock snapshot for a published fixture record", async () => {
    const handler = getJobHandler("metrics.collect");
    const result = await handler(
      {
        databaseJobId: "test-job-d1",
        userId: userAId,
        action: "metrics.collect",
        input: { publishRecordId: publishedRecordId, window: MetricWindow.d1 },
      },
      noProgress,
    );
    expect(result.resultType).toBe("metricSnapshot");
    const snapshot = await prisma.metricSnapshot.findUniqueOrThrow({
      where: {
        publishRecordId_window: { publishRecordId: publishedRecordId, window: MetricWindow.d1 },
      },
    });
    expect(snapshot.viewCount).toBeGreaterThan(0);
    const raw = snapshot.rawData as Record<string, unknown>;
    expect(raw.source).toBe("mock-fixture");
    expect(raw.simulated).toBe(true);
    expect(raw.provider).toBe("aitoearn-mock");
  });

  it("is idempotent per window: re-running upserts instead of duplicating", async () => {
    const handler = getJobHandler("metrics.collect");
    await handler(
      {
        databaseJobId: "test-job-d1-again",
        userId: userAId,
        action: "metrics.collect",
        input: { publishRecordId: publishedRecordId, window: MetricWindow.d1 },
      },
      noProgress,
    );
    const count = await prisma.metricSnapshot.count({
      where: { publishRecordId: publishedRecordId, window: MetricWindow.d1 },
    });
    expect(count).toBe(1);
  });

  it("refuses to collect metrics for non-published records", async () => {
    const handler = getJobHandler("metrics.collect");
    await expect(
      handler(
        {
          databaseJobId: "test-job-submitted",
          userId: userAId,
          action: "metrics.collect",
          input: { publishRecordId: submittedRecordId, window: MetricWindow.d1 },
        },
        noProgress,
      ),
    ).rejects.toThrow(/不存在、越权或尚未发布/);
  });

  it("blocks cross-user metric collection", async () => {
    const handler = getJobHandler("metrics.collect");
    await expect(
      handler(
        {
          databaseJobId: "test-job-cross",
          userId: userBId,
          action: "metrics.collect",
          input: { publishRecordId: publishedRecordId, window: MetricWindow.d1 },
        },
        noProgress,
      ),
    ).rejects.toThrow(/不存在、越权或尚未发布/);
  });
});

describe("D+7 retrospective drafting", () => {
  it("drafts the retrospective with variance and labeled actual outcome", async () => {
    await ensureRetrospective(userAId, publishedRecordId);
    const handler = getJobHandler("metrics.collect");
    await handler(
      {
        databaseJobId: "test-job-d7",
        userId: userAId,
        action: "metrics.collect",
        input: { publishRecordId: publishedRecordId, window: MetricWindow.d7 },
      },
      noProgress,
    );
    const retrospective = await prisma.retrospective.findFirstOrThrow({
      where: { userId: userAId, publishRecordId: publishedRecordId },
    });
    expect(retrospective.status).toBe("drafted");
    const variance = retrospective.variance as Record<string, unknown>;
    expect(typeof variance.outcomeScore).toBe("number");
    expect(typeof variance.delta).toBe("number");
    expect(["underestimated", "overestimated", "aligned"]).toContain(variance.direction);
    // 单次偏差绝不触发规则候选（需要连续 3 次同方向）
    expect(retrospective.ruleProposal).toBeNull();
    const outcome = retrospective.actualOutcome as Record<string, unknown>;
    expect(outcome.source).toBe("mock-fixture");
  });

  it("lists the due retrospective for the owner only, with labeled snapshots", async () => {
    const mine = await listDueRetrospectives(userAId);
    const item = mine.find((entry) => entry.publishRecordId === publishedRecordId);
    expect(item).toBeDefined();
    expect(item!.publishRecord!.availability).toEqual({ available: true });
    expect(
      item!.publishRecord!.metricSnapshots.every(
        (snapshot) => snapshot.dataSource === "mock-fixture",
      ),
    ).toBe(true);
    // 响应不携带供应商原始 payload
    expect(JSON.stringify(item!.publishRecord!.metricSnapshots)).not.toContain("rawData");

    const theirs = await listDueRetrospectives(userBId);
    expect(theirs.some((entry) => entry.publishRecordId === publishedRecordId)).toBe(false);
  });
});

describe("content performance view", () => {
  it("returns an explicit timeline plus unavailable reasons per record", async () => {
    const performance = await getContentPerformance(userAId, contentId);
    const published = performance.records.find((record) => record.id === publishedRecordId)!;
    expect(published.availability).toEqual({ available: true });
    expect(published.simulated).toBe(true);
    const d1 = published.timeline.find((entry) => entry.window === MetricWindow.d1)!;
    expect(d1.status).toBe("collected");
    expect(d1.snapshot?.dataSource).toBe("mock-fixture");
    // 发布于 8 天前但 d3 未采集：显式 due，不留白也不伪造
    expect(published.timeline.find((entry) => entry.window === MetricWindow.d3)!.status).toBe(
      "due",
    );

    const submitted = performance.records.find((record) => record.id === submittedRecordId)!;
    expect(submitted.availability).toMatchObject({
      available: false,
      reason: "waiting_publish",
    });
    expect(submitted.timeline).toEqual([]);
  });

  it("blocks cross-user performance reads", async () => {
    await expect(getContentPerformance(userBId, contentId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("D+1/D+3/D+7 scheduling", () => {
  it("enqueues exactly one job per window, idempotently", async () => {
    const publishedAt = new Date();
    await scheduleMetricJobs(userAId, publishedRecordId, publishedAt);
    await scheduleMetricJobs(userAId, publishedRecordId, publishedAt);
    const jobs = await prisma.processingJob.findMany({
      where: { userId: userAId, action: "metrics.collect" },
    });
    const keys = jobs
      .map((job) => job.idempotencyKey)
      .filter((key) => key?.startsWith(publishedRecordId));
    expect(new Set(keys).size).toBe(3);
    expect(keys.length).toBe(3);
  });
});
