import { MetricWindow, Prisma, type MetricSnapshot, type PublishStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { enqueueJob } from "@/lib/jobs/queues";

const METRIC_DELAYS = {
  [MetricWindow.d1]: 24 * 60 * 60 * 1000,
  [MetricWindow.d3]: 3 * 24 * 60 * 60 * 1000,
  [MetricWindow.d7]: 7 * 24 * 60 * 60 * 1000,
} as const;

export const SCHEDULED_METRIC_WINDOWS = [
  MetricWindow.d1,
  MetricWindow.d3,
  MetricWindow.d7,
] as const;

export type ScheduledMetricWindow = (typeof SCHEDULED_METRIC_WINDOWS)[number];

/** 基于真实发布时间计算 D+1/D+3/D+7 应采集时间；纯函数，供调度与展示共用。 */
export function computeMetricWindows(publishedAt: Date) {
  return SCHEDULED_METRIC_WINDOWS.map((window) => ({
    window,
    dueAt: new Date(publishedAt.getTime() + METRIC_DELAYS[window]),
  }));
}

export type MetricsUnavailableReason =
  | "waiting_publish"
  | "provider_processing"
  | "awaiting_user"
  | "publish_failed"
  | "publish_canceled"
  | "missing_published_at";

export type MetricsAvailability =
  | { available: true }
  | { available: false; reason: MetricsUnavailableReason; message: string };

/**
 * 指标可用性判定：只有真实进入 published 且有发布时间的记录才有指标；
 * submitted/awaiting_user/failed/canceled 一律显式给出"暂无真实数据"的原因，
 * 绝不用模拟数据顶替。
 */
export function resolveMetricsAvailability(record: {
  status: PublishStatus;
  publishedAt: Date | null;
}): MetricsAvailability {
  switch (record.status) {
    case "published":
      if (!record.publishedAt) {
        return {
          available: false,
          reason: "missing_published_at",
          message: "发布记录缺少发布时间，无法安排 D+1/D+3/D+7 指标任务。",
        };
      }
      return { available: true };
    case "submitted":
    case "uploading":
      return {
        available: false,
        reason: "provider_processing",
        message: "供应商处理中：作品尚未真实发布，暂无指标数据。",
      };
    case "awaiting_user":
      return {
        available: false,
        reason: "awaiting_user",
        message: "等待你在平台完成最后确认；确认发布后才会开始采集真实指标。",
      };
    case "failed":
      return {
        available: false,
        reason: "publish_failed",
        message: "发布失败：没有真实作品，不存在指标数据。",
      };
    case "canceled":
      return {
        available: false,
        reason: "publish_canceled",
        message: "发布已取消：没有真实作品，不存在指标数据。",
      };
    default:
      return {
        available: false,
        reason: "waiting_publish",
        message: "作品尚未发布：等待真实发布后才会安排指标任务。",
      };
  }
}

export type PublicMetricSnapshot = {
  id: string;
  window: MetricWindow;
  observedAt: Date;
  viewCount: number | null;
  likeCount: number | null;
  collectCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  followerDelta: number | null;
  /** mock-fixture = 模拟/夹具数据（本地模拟供应商产生），provider = 真实供应商返回。 */
  dataSource: "mock-fixture" | "provider";
};

/** 只暴露展示所需字段与数据来源标签，不透传供应商原始响应。 */
export function toPublicMetricSnapshot(snapshot: MetricSnapshot): PublicMetricSnapshot {
  const raw = asRecord(snapshot.rawData);
  const simulated = raw.simulated === true || raw.source === "mock-fixture";
  return {
    id: snapshot.id,
    window: snapshot.window,
    observedAt: snapshot.observedAt,
    viewCount: snapshot.viewCount,
    likeCount: snapshot.likeCount,
    collectCount: snapshot.collectCount,
    commentCount: snapshot.commentCount,
    shareCount: snapshot.shareCount,
    followerDelta: snapshot.followerDelta,
    dataSource: simulated ? "mock-fixture" : "provider",
  };
}

export type MetricTimelineEntry = {
  window: ScheduledMetricWindow;
  dueAt: Date;
  /** collected = 已有快照；scheduled = 未到期；due = 已到期但任务尚未返回。 */
  status: "collected" | "scheduled" | "due";
  snapshot: PublicMetricSnapshot | null;
};

/** 把已有快照对齐到 D+1/D+3/D+7 时间线，缺失窗口给出显式状态而不是留白。 */
export function buildMetricTimeline(
  publishedAt: Date,
  snapshots: MetricSnapshot[],
  now = new Date(),
): MetricTimelineEntry[] {
  return computeMetricWindows(publishedAt).map(({ window, dueAt }) => {
    const snapshot = snapshots.find((item) => item.window === window);
    if (snapshot) {
      return { window, dueAt, status: "collected", snapshot: toPublicMetricSnapshot(snapshot) };
    }
    return { window, dueAt, status: dueAt.getTime() <= now.getTime() ? "due" : "scheduled", snapshot: null };
  });
}

export async function scheduleMetricJobs(
  userId: string,
  publishRecordId: string,
  publishedAt: Date,
) {
  for (const { window, dueAt } of computeMetricWindows(publishedAt)) {
    const delayMs = Math.max(0, dueAt.getTime() - Date.now());
    await enqueueJob({
      userId,
      type: "metrics",
      action: "metrics.collect",
      input: { publishRecordId, window, targetAt: dueAt.toISOString() },
      idempotencyKey: `${publishRecordId}:${window}`,
      delayMs,
      maxAttempts: 4,
    });
  }
}

export async function ensureRetrospective(
  userId: string,
  publishRecordId: string,
) {
  const record = await prisma.publishRecord.findFirst({
    where: { id: publishRecordId, userId },
    include: { content: true },
  });
  if (!record) throw new AppError("NOT_FOUND", "发布记录不存在。", 404);
  const existing = await prisma.retrospective.findFirst({
    where: { userId, publishRecordId },
  });
  if (existing) return existing;
  const publishedAt = record.publishedAt ?? new Date();
  return prisma.retrospective.create({
    data: {
      userId,
      contentId: record.contentId,
      publishRecordId,
      scoringRubricId: record.content.scoringRubricId,
      dueAt: new Date(publishedAt.getTime() + METRIC_DELAYS.d7),
      predictedScore: record.content.scoreSnapshot ?? Prisma.JsonNull,
    },
  });
}

export async function getContentPerformance(userId: string, contentId: string) {
  const content = await prisma.generatedContent.findFirst({
    where: { id: contentId, userId },
    select: {
      id: true,
      title: true,
      platform: true,
      scoreSnapshot: true,
      publishRecords: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          platform: true,
          publishedAt: true,
          publicUrl: true,
          shortLink: true,
          providerResponse: true,
          createdAt: true,
          metricSnapshots: { orderBy: { observedAt: "asc" } },
          retrospectives: {
            select: {
              id: true,
              status: true,
              dueAt: true,
              variance: true,
              conclusions: true,
              resolvedAt: true,
            },
          },
        },
      },
    },
  });
  if (!content) throw new AppError("NOT_FOUND", "内容项目不存在。", 404);
  return {
    content: {
      id: content.id,
      title: content.title,
      platform: content.platform,
      scoreSnapshot: content.scoreSnapshot,
    },
    records: content.publishRecords.map((record) => {
      const availability = resolveMetricsAvailability(record);
      const simulated =
        asRecord(record.providerResponse).simulated === true ||
        record.metricSnapshots.some(
          (snapshot) => toPublicMetricSnapshot(snapshot).dataSource === "mock-fixture",
        );
      return {
        id: record.id,
        status: record.status,
        platform: record.platform,
        publishedAt: record.publishedAt,
        publicUrl: record.publicUrl,
        shortLink: record.shortLink,
        createdAt: record.createdAt,
        /** true = 该记录来自本地模拟供应商或含模拟指标，展示时必须打标。 */
        simulated,
        availability,
        timeline:
          availability.available && record.publishedAt
            ? buildMetricTimeline(record.publishedAt, record.metricSnapshots)
            : [],
        retrospectives: record.retrospectives,
      };
    }),
  };
}

export async function listDueRetrospectives(userId: string) {
  const retrospectives = await prisma.retrospective.findMany({
    where: { userId, status: { in: ["pending", "drafted"] }, dueAt: { lte: new Date() } },
    include: {
      content: { select: { title: true, platform: true, scoreSnapshot: true } },
      publishRecord: { include: { metricSnapshots: { orderBy: { observedAt: "asc" } } } },
      scoringRubric: { select: { name: true, version: true } },
    },
    orderBy: { dueAt: "asc" },
  });
  return retrospectives.map((item) => ({
    ...item,
    publishRecord: item.publishRecord
      ? {
          id: item.publishRecord.id,
          status: item.publishRecord.status,
          publishedAt: item.publishRecord.publishedAt,
          publicUrl: item.publishRecord.publicUrl,
          availability: resolveMetricsAvailability(item.publishRecord),
          metricSnapshots: item.publishRecord.metricSnapshots.map(toPublicMetricSnapshot),
        }
      : null,
  }));
}

export async function updateRetrospective(
  userId: string,
  retrospectiveId: string,
  input: {
    status?: "drafted" | "accepted" | "dismissed";
    conclusions?: string;
    ruleProposal?: unknown;
  },
) {
  const existing = await prisma.retrospective.findFirst({
    where: { id: retrospectiveId, userId },
  });
  if (!existing) throw new AppError("NOT_FOUND", "复盘不存在。", 404);
  return prisma.retrospective.update({
    where: { id: retrospectiveId },
    data: {
      status: input.status,
      conclusions: input.conclusions,
      ruleProposal:
        input.ruleProposal === undefined
          ? undefined
          : (JSON.parse(JSON.stringify(input.ruleProposal)) as Prisma.InputJsonValue),
      resolvedAt:
        input.status === "accepted" || input.status === "dismissed" ? new Date() : undefined,
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
