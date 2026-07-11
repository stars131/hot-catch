import { createHash } from "node:crypto";
import { CredentialProvider, Prisma, type PublishStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { AiToEarnProvider } from "@/lib/providers/aitoearn/provider";
import type { ProviderPublishRecord } from "@/lib/providers/types";
import { loadCredential } from "@/lib/services/credential-service";
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

export async function getPublishRecord(userId: string, recordId: string) {
  const record = await prisma.publishRecord.findFirst({
    where: { id: recordId, userId },
    select: publicRecordSelect,
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
  const provider = await getAiToEarnProvider(userId);
  const remote = await provider.getRecord(local.providerRecordId);
  await applyProviderRecord(local.id, remote);
  if (remote.status === "published" && local.status !== "published") {
    const publishedAt = new Date();
    await ensureRetrospective(userId, local.id);
    await scheduleMetricJobs(userId, local.id, publishedAt);
  }
  return getPublishRecord(userId, local.id);
}

export async function applyProviderRecord(
  localRecordId: string,
  remote: ProviderPublishRecord,
) {
  return prisma.publishRecord.update({
    where: { id: localRecordId },
    data: {
      providerFlowId: remote.flowId,
      providerRecordId: remote.recordId,
      status: remote.status as PublishStatus,
      shortLink: remote.shortLink,
      publicUrl: remote.publicUrl,
      failureCode: remote.failureCode,
      failureReason: remote.failureReason,
      providerResponse: toJson(remote.raw),
      submittedAt: ["submitted", "awaiting_user", "published"].includes(remote.status)
        ? new Date()
        : undefined,
      publishedAt: remote.status === "published" ? new Date() : undefined,
      lastSyncedAt: new Date(),
      attemptCount: { increment: 1 },
    },
  });
}

export async function cancelPublishRecord(userId: string, localRecordId: string) {
  const local = await prisma.publishRecord.findFirst({
    where: { id: localRecordId, userId },
  });
  if (!local) throw new AppError("NOT_FOUND", "发布记录不存在。", 404);
  if (["published", "canceled"].includes(local.status)) {
    throw new AppError("CONFLICT", "当前发布状态不能取消。", 409);
  }
  if (local.providerRecordId) {
    const provider = await getAiToEarnProvider(userId);
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
