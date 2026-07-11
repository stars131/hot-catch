import { isAppError } from "@/lib/errors";
import { registerJobHandler } from "@/lib/jobs/handlers";
import type { JobHandler } from "@/lib/jobs/types";
import { prisma } from "@/lib/prisma";
import {
  applyProviderRecord,
  getAiToEarnProvider,
} from "@/lib/services/publishing-service";
import {
  ensureRetrospective,
  scheduleMetricJobs,
} from "@/lib/services/performance-service";

const publishingHandler: JobHandler = async (payload, reportProgress) => {
  const input = payload.input as { localRecordId?: string; mode?: "create" | "retry" | "sync" };
  if (!input.localRecordId) throw new Error("localRecordId is required");
  const local = await prisma.publishRecord.findFirst({
    where: { id: input.localRecordId, userId: payload.userId },
  });
  if (!local) throw new Error("发布记录不存在或不属于当前用户。");

  let provider;
  try {
    provider = await getAiToEarnProvider(payload.userId);
  } catch (error) {
    if (isAppError(error) && error.code === "CREDENTIAL_NOT_CONFIGURED") {
      return {
        finalStatus: "waiting_input",
        resultType: "publishRecord",
        resultId: local.id,
        output: { reason: "AITO_EARN_CREDENTIAL_REQUIRED", message: "请先配置 AiToEarn 凭证。" },
      };
    }
    throw error;
  }

  await reportProgress(25, "提交发布任务");
  let remote;
  if (input.mode === "retry" && local.providerRecordId) {
    remote = await provider.retry(local.providerRecordId);
  } else if (local.providerRecordId) {
    remote = await provider.getRecord(local.providerRecordId);
  } else {
    remote = await provider.createFlow({
      platform: local.platform,
      accountId: local.providerAccountId ?? "",
      idempotencyKey: local.idempotencyKey,
      scheduledAt: local.scheduledAt ?? undefined,
      payload: local.requestPayload as Record<string, unknown>,
    });
  }
  await reportProgress(80, remote.status === "awaiting_user" ? "等待用户在抖音确认" : "同步发布状态");
  await applyProviderRecord(local.id, remote);
  if (remote.status === "published") {
    const publishedAt = local.publishedAt ?? new Date();
    await ensureRetrospective(payload.userId, local.id);
    await scheduleMetricJobs(payload.userId, local.id, publishedAt);
  }
  return {
    resultType: "publishRecord",
    resultId: local.id,
    output: { status: remote.status, shortLink: remote.shortLink },
  };
};

registerJobHandler("publish.create", publishingHandler);
registerJobHandler("publish.retry", publishingHandler);
registerJobHandler("publish.sync", publishingHandler);
