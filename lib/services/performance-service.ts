import { MetricWindow, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { enqueueJob } from "@/lib/jobs/queues";

const METRIC_DELAYS = {
  [MetricWindow.d1]: 24 * 60 * 60 * 1000,
  [MetricWindow.d3]: 3 * 24 * 60 * 60 * 1000,
  [MetricWindow.d7]: 7 * 24 * 60 * 60 * 1000,
} as const;

export async function scheduleMetricJobs(
  userId: string,
  publishRecordId: string,
  publishedAt: Date,
) {
  for (const window of [MetricWindow.d1, MetricWindow.d3, MetricWindow.d7]) {
    const targetAt = new Date(publishedAt.getTime() + METRIC_DELAYS[window]);
    const delayMs = Math.max(0, targetAt.getTime() - Date.now());
    await enqueueJob({
      userId,
      type: "metrics",
      action: "metrics.collect",
      input: { publishRecordId, window, targetAt: targetAt.toISOString() },
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
          publishedAt: true,
          publicUrl: true,
          metricSnapshots: { orderBy: { observedAt: "asc" } },
          retrospectives: true,
        },
      },
    },
  });
  if (!content) throw new AppError("NOT_FOUND", "内容项目不存在。", 404);
  return content;
}

export async function listDueRetrospectives(userId: string) {
  return prisma.retrospective.findMany({
    where: { userId, status: { in: ["pending", "drafted"] }, dueAt: { lte: new Date() } },
    include: {
      content: { select: { title: true, platform: true, scoreSnapshot: true } },
      publishRecord: { include: { metricSnapshots: { orderBy: { observedAt: "asc" } } } },
      scoringRubric: { select: { name: true, version: true } },
    },
    orderBy: { dueAt: "asc" },
  });
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
