import { createHash } from "node:crypto";
import {
  CredentialProvider,
  Prisma,
  type PublishStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError, isAppError } from "@/lib/errors";
import { resolvePublishProviderMode, type PublishProviderMode } from "@/lib/env";
import { AiToEarnProvider } from "@/lib/providers/aitoearn/provider";
import { MockAiToEarnProvider } from "@/lib/providers/aitoearn/mock-provider";
import type {
  ProviderPublishRecord,
  PublishingProvider,
} from "@/lib/providers/types";
import { loadCredential } from "@/lib/services/credential-service";
import { getAiToEarnConnectionStatus } from "@/lib/services/connection-service";
import {
  PUBLISH_SUBMITTABLE_STATUSES,
  canTransitionPublishStatus,
  isPublishRecordCancelable,
  isPublishRecordRetryable,
} from "@/lib/services/publish-state-machine";
import {
  ensureRetrospective,
  scheduleMetricJobs,
} from "@/lib/services/performance-service";
import type { z } from "zod";
import type { createPublishFlowSchema } from "@/lib/validators/publishing";

type CreatePublishFlowInput = z.infer<typeof createPublishFlowSchema>;

export async function getAiToEarnProvider(userId: string) {
  const credential = await loadCredential(userId, CredentialProvider.aitoearn);
  const apiKey = credential.apiKey ?? credential.token;
  if (!apiKey) throw new AppError("CREDENTIAL_INVALID", "AiToEarn 凭证缺少 apiKey。", 422);
  return new AiToEarnProvider(apiKey, credential.baseUrl);
}

export type ResolvedPublishingProvider = {
  provider: PublishingProvider;
  mode: PublishProviderMode;
};

/**
 * C10 供应商解析层：所有发布/素材/账号入口统一经此获取 provider。
 *
 * - 凭证未配置或已失效时显式抛 connection_required，不创建悬空记录、不假成功；
 * - mock 模式（开发/测试默认）返回本地模拟供应商，绝不解密凭证、绝不联网；
 * - real 模式（生产强制，或显式 PUBLISH_PROVIDER_MODE=real）才加载凭证并
 *   构造真实 AiToEarnProvider——本批次不会在任何测试/CI 中走到真实调用。
 */
export async function resolvePublishingProvider(
  userId: string,
): Promise<ResolvedPublishingProvider> {
  const status = await getAiToEarnConnectionStatus(userId);
  if (status.connection === "not_configured") {
    throw new AppError(
      "CREDENTIAL_NOT_CONFIGURED",
      "AiToEarn 尚未连接：请先到连接设置保存 API Key。",
      422,
      { reason: "connection_required", connection: "not_configured" },
    );
  }
  if (status.connection === "invalid") {
    throw new AppError(
      "CREDENTIAL_INVALID",
      "AiToEarn 凭证已失效：请到连接设置更新凭证后重试。",
      422,
      { reason: "connection_required", connection: "invalid" },
    );
  }
  const mode = resolvePublishProviderMode();
  if (mode === "mock") {
    return { provider: new MockAiToEarnProvider(), mode };
  }
  return { provider: await getAiToEarnProvider(userId), mode };
}

export async function preparePublishRecord(
  userId: string,
  input: CreatePublishFlowInput,
  clientIdempotencyKey?: string,
) {
  const content = await prisma.generatedContent.findFirst({
    where: { id: input.contentId, userId },
    include: { revisions: { orderBy: { revisionNumber: "desc" } } },
  });
  if (!content) throw new AppError("NOT_FOUND", "内容项目不存在。", 404);
  assertPublishablePlatform(content.platform);
  const revision = input.revisionId
    ? content.revisions.find((item) => item.id === input.revisionId)
    : content.revisions[0];
  if (!revision) throw new AppError("VALIDATION_ERROR", "发布前必须先保存内容版本。", 422);
  if (content.platform === "xiaohongshu" && input.assets.some((asset) => asset.type !== "image")) {
    throw new AppError("VALIDATION_ERROR", "小红书图文只能提交图片素材。", 422);
  }
  if (content.platform === "douyin" && !input.assets.some((asset) => asset.type === "video")) {
    throw new AppError("VALIDATION_ERROR", "抖音发布必须包含视频素材。", 422);
  }

  const keyMaterial =
    clientIdempotencyKey?.trim() ||
    JSON.stringify({
      userId,
      revisionId: revision.id,
      accountId: input.accountId,
      scheduledAt: input.scheduledAt,
      assets: input.assets,
    });
  const idempotencyKey = createHash("sha256")
    .update(`${userId}:${keyMaterial}`)
    .digest("hex");
  const bodyText = revision.bodyText ?? content.bodyText ?? "";
  const title = revision.title ?? content.title ?? "";
  const bodyWithTags = [bodyText, content.tags.map((tag) => `#${tag}`).join(" ")]
    .filter(Boolean)
    .join("\n\n");
  const media = input.assets.map((asset) => ({
    url: asset.url,
    metadata: { type: asset.type },
  }));
  const payload = {
    content: {
      title,
      body: bodyWithTags,
      media,
      ...(input.coverUrl
        ? { cover: { url: input.coverUrl, metadata: { type: "image" } } }
        : {}),
    },
    context: {
      type: content.platform === "douyin" ? "video" : "image",
      ...(content.platform === "douyin"
        ? { videoUrl: input.assets.find((asset) => asset.type === "video")?.url }
        : {}),
    },
    items: [
      {
        accountId: input.accountId,
        platform: content.platform,
        overrides: {
          title,
          body: bodyWithTags,
          media,
          ...(input.coverUrl
            ? { cover: { url: input.coverUrl, metadata: { type: "image" } } }
            : {}),
        },
        ...(input.option ? { option: input.option } : {}),
      },
    ],
  };

  return prisma.publishRecord.upsert({
    where: { idempotencyKey },
    update: {},
    create: {
      userId,
      contentId: content.id,
      revisionId: revision.id,
      platform: content.platform,
      status: input.scheduledAt ? "scheduled" : "draft",
      providerAccountId: input.accountId,
      idempotencyKey,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
      requestPayload: payload as Prisma.InputJsonValue,
    },
  });
}

/**
 * 本地发布状态机执行：把一条 draft/scheduled/failed 记录交给供应商并收敛状态。
 *
 * - 在途（uploading/submitted/awaiting_user）与终态记录直接返回现状，绝不重复提交；
 * - 已有 providerRecordId 时先查询供应商真实状态再决定是否重试——
 *   覆盖"提交超时但供应商其实已创建"的恢复路径，不盲目重发；
 * - 首次提交携带本地幂等键，供应商侧（含 mock）按键防重；
 * - 供应商错误不会作为 5xx 冒泡：记录收敛为 failed（含原因），由 UI 提供重试。
 */
export async function submitPublishRecord(userId: string, localRecordId: string) {
  const local = await prisma.publishRecord.findFirst({
    where: { id: localRecordId, userId },
  });
  if (!local) throw new AppError("NOT_FOUND", "发布记录不存在。", 404);
  assertPublishablePlatform(local.platform);
  if (!PUBLISH_SUBMITTABLE_STATUSES.has(local.status)) {
    return getPublishRecord(userId, local.id);
  }
  // 连接检查在 try 外：connection_required 必须显式返回给调用方，而不是把记录标失败。
  const { provider } = await resolvePublishingProvider(userId);
  try {
    let remote: ProviderPublishRecord;
    if (local.providerRecordId) {
      remote = await provider.getRecord(local.providerRecordId);
      if (remote.status === "failed") {
        remote = await provider.retry(local.providerRecordId);
      }
    } else {
      remote = await provider.createFlow({
        platform: local.platform,
        accountId: local.providerAccountId ?? "",
        idempotencyKey: local.idempotencyKey,
        scheduledAt: local.scheduledAt ?? undefined,
        payload: local.requestPayload as Record<string, unknown>,
      });
    }
    await applyProviderRecord(local.id, remote, { countAttempt: true });
  } catch (error) {
    await markPublishRecordFailed(local.id, error);
  }
  return getPublishRecord(userId, local.id);
}

export async function assertContentPublishingSupported(
  userId: string,
  contentId: string,
) {
  const content = await prisma.generatedContent.findFirst({
    where: { id: contentId, userId },
    select: { platform: true },
  });
  if (!content) throw new AppError("NOT_FOUND", "内容项目不存在。", 404);
  assertPublishablePlatform(content.platform);
}

function assertPublishablePlatform(platform: string) {
  if (platform === "xiaohongshu" || platform === "douyin") return;
  throw new AppError(
    "PUBLISHING_NOT_SUPPORTED",
    "该国外平台当前仅支持导出后手动发布，不支持账号连接或自动发布。",
    422,
    { messageKey: "errors.publishingNotSupported", platform },
  );
}

/** 重试守卫：只有 failed 可重试；具体恢复逻辑复用 submitPublishRecord 的先查询语义。 */
export async function retryPublishRecord(userId: string, localRecordId: string) {
  const local = await prisma.publishRecord.findFirst({
    where: { id: localRecordId, userId },
  });
  if (!local) throw new AppError("NOT_FOUND", "发布记录不存在。", 404);
  if (!isPublishRecordRetryable(local.status)) {
    throw new AppError("CONFLICT", "只有失败的发布记录可以重试。", 409);
  }
  return submitPublishRecord(userId, localRecordId);
}

export async function getPublishRecord(userId: string, recordId: string) {
  const record = await prisma.publishRecord.findFirst({
    where: { id: recordId, userId },
    select: { ...publicRecordSelect, content: { select: { title: true } } },
  });
  if (!record) throw new AppError("NOT_FOUND", "发布记录不存在。", 404);
  return record;
}

export async function listPublishRecords(userId: string, take = 30) {
  return prisma.publishRecord.findMany({
    where: { userId },
    select: {
      ...publicRecordSelect,
      content: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(take, 1), 100),
  });
}

export async function syncPublishRecord(userId: string, localRecordId: string) {
  const local = await prisma.publishRecord.findFirst({
    where: { id: localRecordId, userId },
  });
  if (!local) throw new AppError("NOT_FOUND", "发布记录不存在。", 404);
  if (!local.providerRecordId) return getPublishRecord(userId, local.id);
  const { provider } = await resolvePublishingProvider(userId);
  const remote = await provider.getRecord(local.providerRecordId);
  await applyProviderRecord(local.id, remote);
  if (remote.status === "published" && local.status !== "published") {
    const publishedAt = new Date();
    await ensureRetrospective(userId, local.id);
    await scheduleMetricJobs(userId, local.id, publishedAt);
  }
  return getPublishRecord(userId, local.id);
}

/**
 * 把供应商侧状态收敛进本地记录。同步是观察而不是命令：
 * 不满足状态机方向的回写（终态覆盖、awaiting_user 回退等）只记录
 * lastSyncedAt 与供应商响应，本地状态保持不变。
 */
export async function applyProviderRecord(
  localRecordId: string,
  remote: ProviderPublishRecord,
  options: { countAttempt?: boolean } = {},
) {
  const local = await prisma.publishRecord.findUnique({
    where: { id: localRecordId },
  });
  if (!local) throw new AppError("NOT_FOUND", "发布记录不存在。", 404);
  const remoteStatus = remote.status as PublishStatus;
  const nextStatus = canTransitionPublishStatus(local.status, remoteStatus)
    ? remoteStatus
    : local.status;
  const enteredSubmission = ["submitted", "awaiting_user", "published"].includes(nextStatus);
  return prisma.publishRecord.update({
    where: { id: localRecordId },
    data: {
      providerFlowId: remote.flowId,
      providerRecordId: remote.recordId,
      status: nextStatus,
      shortLink: remote.shortLink,
      publicUrl: remote.publicUrl,
      // 离开 failed 后清空历史失败原因，避免旧错误残留在成功记录上
      failureCode: remote.failureCode ?? (nextStatus === "failed" ? undefined : null),
      failureReason: remote.failureReason ?? (nextStatus === "failed" ? undefined : null),
      providerResponse: toJson(remote.raw),
      submittedAt: !local.submittedAt && enteredSubmission ? new Date() : undefined,
      publishedAt:
        !local.publishedAt && nextStatus === "published" ? new Date() : undefined,
      lastSyncedAt: new Date(),
      attemptCount: options.countAttempt ? { increment: 1 } : undefined,
    },
  });
}

/** 供应商执行失败时的本地收敛：只有状态机允许时才落 failed，并保留可读原因。 */
async function markPublishRecordFailed(localRecordId: string, error: unknown) {
  const local = await prisma.publishRecord.findUnique({
    where: { id: localRecordId },
  });
  if (!local || !canTransitionPublishStatus(local.status, "failed")) return;
  const detailCode =
    isAppError(error) &&
    error.details &&
    typeof error.details === "object" &&
    "failureCode" in error.details &&
    typeof error.details.failureCode === "string"
      ? error.details.failureCode
      : null;
  await prisma.publishRecord.update({
    where: { id: localRecordId },
    data: {
      status: "failed",
      failureCode: detailCode ?? (isAppError(error) ? error.code : "UNKNOWN_ERROR"),
      failureReason:
        error instanceof Error ? error.message : "发布执行失败，供应商未返回原因。",
      attemptCount: { increment: 1 },
      lastSyncedAt: new Date(),
    },
  });
}

export async function cancelPublishRecord(userId: string, localRecordId: string) {
  const local = await prisma.publishRecord.findFirst({
    where: { id: localRecordId, userId },
  });
  if (!local) throw new AppError("NOT_FOUND", "发布记录不存在。", 404);
  if (!isPublishRecordCancelable(local.status)) {
    throw new AppError("CONFLICT", "当前发布状态不能取消。", 409);
  }
  if (local.providerRecordId) {
    const { provider } = await resolvePublishingProvider(userId);
    await provider.cancel(local.providerRecordId);
  }
  await prisma.publishRecord.update({
    where: { id: local.id },
    data: { status: "canceled", lastSyncedAt: new Date() },
  });
  return getPublishRecord(userId, local.id);
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

const publicRecordSelect = {
  id: true,
  contentId: true,
  revisionId: true,
  platform: true,
  status: true,
  providerAccountId: true,
  scheduledAt: true,
  submittedAt: true,
  publishedAt: true,
  shortLink: true,
  publicUrl: true,
  failureCode: true,
  failureReason: true,
  attemptCount: true,
  lastSyncedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PublishRecordSelect;
