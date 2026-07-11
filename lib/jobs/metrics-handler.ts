import { MetricWindow, Prisma } from "@prisma/client";
import { registerJobHandler } from "@/lib/jobs/handlers";
import type { JobHandler } from "@/lib/jobs/types";
import { normalizeMetrics } from "@/lib/metrics/normalizer";
import { prisma } from "@/lib/prisma";
import { getAiToEarnProvider } from "@/lib/services/publishing-service";

const metricsHandler: JobHandler = async (payload, reportProgress) => {
  const input = payload.input as { publishRecordId?: string; window?: MetricWindow };
  if (!input.publishRecordId || !input.window) throw new Error("Metric job input is incomplete");
  const record = await prisma.publishRecord.findFirst({
    where: { id: input.publishRecordId, userId: payload.userId },
    include: { content: true },
  });
  if (!record || record.status !== "published") {
    throw new Error("发布记录不存在、越权或尚未发布。");
  }
  if (!record.providerRecordId) throw new Error("发布记录缺少供应商记录 ID。");

  await reportProgress(20, "同步作品标识");
  const provider = await getAiToEarnProvider(payload.userId);
  const remote = await provider.getRecord(record.providerRecordId);
  const raw = asRecord(unwrap(remote.raw));
  const platformWorkId = stringValue(raw.platformWorkId);
  if (!platformWorkId) {
    throw new Error("AiToEarn 尚未返回平台作品 ID，将按退避策略重试。");
  }
  await reportProgress(50, "读取平台指标");
  const metrics = normalizeMetrics(
    await provider.getWorkAnalytics(record.platform, platformWorkId),
  );
  const snapshot = await prisma.metricSnapshot.upsert({
    where: {
      publishRecordId_window: {
        publishRecordId: record.id,
        window: input.window,
      },
    },
    update: { ...metrics, observedAt: new Date() },
    create: {
      userId: payload.userId,
      publishRecordId: record.id,
      window: input.window,
      ...metrics,
    },
  });
  if (input.window === MetricWindow.d7) {
    await reportProgress(80, "生成预测偏差");
    await updateD7Retrospective(payload.userId, record.id, metrics);
  }
  return { resultType: "metricSnapshot", resultId: snapshot.id };
};

async function updateD7Retrospective(
  userId: string,
  publishRecordId: string,
  metrics: ReturnType<typeof normalizeMetrics>,
) {
  const retrospective = await prisma.retrospective.findFirst({
    where: { userId, publishRecordId },
    include: { content: true },
  });
  if (!retrospective) return;
  const predicted = asRecord(retrospective.predictedScore);
  const predictedTotal = numberValue(predicted.total);
  const engagement =
    (metrics.likeCount ?? 0) * 2 +
    (metrics.collectCount ?? 0) * 3 +
    (metrics.commentCount ?? 0) * 3 +
    (metrics.shareCount ?? 0) * 4;
  const views = Math.max(metrics.viewCount ?? 0, 1);
  const outcomeScore = Math.min(100, Math.round((engagement / views) * 1000));
  const delta = outcomeScore - predictedTotal;
  const direction = delta > 10 ? "underestimated" : delta < -10 ? "overestimated" : "aligned";

  const recent = await prisma.retrospective.findMany({
    where: { userId, scoringRubricId: retrospective.scoringRubricId, id: { not: retrospective.id } },
    orderBy: { updatedAt: "desc" },
    take: 2,
    select: { variance: true },
  });
  const directions = [direction, ...recent.map((item) => stringValue(asRecord(item.variance).direction))];
  const repeated = direction !== "aligned" && directions.length === 3 && directions.every((item) => item === direction);
  await prisma.retrospective.update({
    where: { id: retrospective.id },
    data: {
      status: "drafted",
      actualOutcome: metrics.rawData,
      variance: { predictedTotal, outcomeScore, delta, direction },
      ruleProposal: repeated
        ? {
            status: "candidate",
            direction,
            reason: `连续 3 次${direction === "overestimated" ? "高估" : "低估"}，建议创建新规则版本并回测。`,
            requiresBacktest: true,
            requiresUserApproval: true,
          }
        : Prisma.JsonNull,
    },
  });
}

function unwrap(value: unknown) {
  return asRecord(value).data ?? value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

registerJobHandler("metrics.collect", metricsHandler);
