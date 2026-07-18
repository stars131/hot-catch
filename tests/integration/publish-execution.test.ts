import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { saveCredential } from "@/lib/services/credential-service";
import {
  createContentProject,
  createContentRevision,
} from "@/lib/services/content-project-service";
import {
  cancelPublishRecord,
  getPublishRecord,
  preparePublishRecord,
  resolvePublishingProvider,
  retryPublishRecord,
  submitPublishRecord,
  syncPublishRecord,
} from "@/lib/services/publishing-service";
import { MOCK_DOUYIN_SHORT_LINK } from "@/lib/providers/aitoearn/mock-provider";

/**
 * C10 本地发布执行状态机集成测试（PUBLISH_PROVIDER_MODE=mock，绝不联网）。
 *
 * 覆盖：连接前置（connection_required/not_configured/invalid）、创建-提交-查询
 * 全链路落库、幂等防重、失败→重试恢复、超时先按幂等键恢复不重复创建、
 * retry/cancel 守卫、终态保护、跨用户越权与响应不泄漏密钥。
 */

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let userAId = "";
let userBId = "";
let douyinContentId = "";
let xhsContentId = "";

const VIDEO_ASSETS = [{ url: "https://assets.example/video.mp4", type: "video" as const }];
const IMAGE_ASSETS = [{ url: "https://assets.example/cover.jpg", type: "image" as const }];

async function seedContent(userId: string, platform: "douyin" | "xiaohongshu") {
  const content = await createContentProject(userId, {
    platform,
    contentKind: platform === "douyin" ? "douyin_video_script" : "xhs_graphic",
    title: `C10 发布执行 ${platform} ${runId}`,
  });
  await createContentRevision(userId, content.id, {
    source: "manual",
    title: `C10 发布执行 ${platform}`,
    bodyText: "本地状态机验证文案。",
    structuredContent: platform === "douyin" ? { shots: [] } : { pages: [] },
  });
  return content.id;
}

beforeAll(async () => {
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `c10-a-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `c10-b-${runId}@example.com` } }),
  ]);
  userAId = userA.id;
  userBId = userB.id;
  douyinContentId = await seedContent(userAId, "douyin");
  xhsContentId = await seedContent(userAId, "xiaohongshu");
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("connection gate", () => {
  it("returns explicit connection_required when no credential is configured", async () => {
    await expect(resolvePublishingProvider(userAId)).rejects.toMatchObject({
      code: "CREDENTIAL_NOT_CONFIGURED",
      statusCode: 422,
      details: { reason: "connection_required", connection: "not_configured" },
    });
  });

  it("returns explicit connection_required when the credential is invalid", async () => {
    await saveCredential(userAId, "aitoearn", { apiKey: `mock-fixture-key-${runId}` });
    await prisma.providerCredential.update({
      where: { userId_provider: { userId: userAId, provider: "aitoearn" } },
      data: { status: "invalid" },
    });
    await expect(resolvePublishingProvider(userAId)).rejects.toMatchObject({
      code: "CREDENTIAL_INVALID",
      details: { reason: "connection_required", connection: "invalid" },
    });
    // 恢复为 active，供后续全链路用例使用
    await prisma.providerCredential.update({
      where: { userId_provider: { userId: userAId, provider: "aitoearn" } },
      data: { status: "active" },
    });
  });

  it("resolves the mock provider in test mode and never exposes key material", async () => {
    const resolved = await resolvePublishingProvider(userAId);
    expect(resolved.mode).toBe("mock");
    expect(resolved.provider.name).toBe("aitoearn-mock");
    const serialized = JSON.stringify(resolved.provider.getMetadata()).toLowerCase();
    expect(serialized).not.toContain("mock-fixture-key");
    expect(serialized).not.toContain("apikey");
  });
});

describe("create → submit → query lifecycle", () => {
  it("runs the Douyin flow to awaiting_user with the fixture short link, all persisted", async () => {
    const record = await preparePublishRecord(
      userAId,
      { contentId: douyinContentId, accountId: "mock-douyin-active", assets: VIDEO_ASSETS },
      `c10-lifecycle-${runId}`,
    );
    expect(record.status).toBe("draft");

    const submitted = await submitPublishRecord(userAId, record.id);
    expect(submitted.status).toBe("submitted");
    expect(submitted.shortLink).toBeNull();
    expect(submitted.attemptCount).toBe(1);
    expect(submitted.submittedAt).not.toBeNull();

    const synced = await syncPublishRecord(userAId, record.id);
    expect(synced.status).toBe("awaiting_user");
    expect(synced.shortLink).toBe(MOCK_DOUYIN_SHORT_LINK);
    // 查询同步不计入提交次数
    expect(synced.attemptCount).toBe(1);

    const persisted = await prisma.publishRecord.findUnique({ where: { id: record.id } });
    expect(persisted?.status).toBe("awaiting_user");
    expect(persisted?.providerRecordId).toMatch(/^mock-record-/);
    expect((persisted?.providerResponse as Record<string, unknown>).simulated).toBe(true);
  });

  it("is idempotent: the same client key re-submits nothing and returns the same record", async () => {
    const input = {
      contentId: douyinContentId,
      accountId: "mock-douyin-active",
      assets: VIDEO_ASSETS,
    };
    const clientKey = `c10-idem-${runId}`;
    const first = await preparePublishRecord(userAId, input, clientKey);
    const firstResult = await submitPublishRecord(userAId, first.id);
    expect(firstResult.status).toBe("submitted");
    expect(firstResult.attemptCount).toBe(1);

    // 重复请求：同一幂等键 → 同一记录；在途状态直接返回，不再触达供应商
    const second = await preparePublishRecord(userAId, input, clientKey);
    expect(second.id).toBe(first.id);
    const secondResult = await submitPublishRecord(userAId, second.id);
    expect(secondResult.status).toBe("submitted");
    expect(secondResult.attemptCount).toBe(1);
  });

  it("keeps failure fields explicit, then recovers via guarded retry without duplicate publish", async () => {
    const record = await preparePublishRecord(
      userAId,
      { contentId: douyinContentId, accountId: "mock-douyin-fail", assets: VIDEO_ASSETS },
      `c10-retry-${runId}`,
    );
    await submitPublishRecord(userAId, record.id);
    // 在途状态不可重试
    await expect(retryPublishRecord(userAId, record.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });

    const failed = await syncPublishRecord(userAId, record.id);
    expect(failed.status).toBe("failed");
    expect(failed.failureCode).toBe("MOCK_PUBLISH_REJECTED");
    expect(failed.failureReason).toContain("模拟");

    const recovered = await retryPublishRecord(userAId, record.id);
    expect(recovered.status).toBe("awaiting_user");
    expect(recovered.shortLink).toBe(MOCK_DOUYIN_SHORT_LINK);
    // 重试成功后清空历史失败原因
    expect(recovered.failureCode).toBeNull();
    expect(recovered.failureReason).toBeNull();
    expect(recovered.attemptCount).toBe(2);

    const persisted = await prisma.publishRecord.findUnique({ where: { id: record.id } });
    const raw = persisted?.providerResponse as Record<string, unknown>;
    // 供应商侧只创建过一次任务：重试没有产生重复发布
    expect(raw.createFlowCalls).toBe(1);
    expect(raw.retryCount).toBe(1);
  });

  it("recovers a submit timeout through the idempotency key without creating a duplicate task", async () => {
    const record = await preparePublishRecord(
      userAId,
      { contentId: douyinContentId, accountId: "mock-douyin-timeout", assets: VIDEO_ASSETS },
      `c10-timeout-${runId}`,
    );
    const timedOut = await submitPublishRecord(userAId, record.id);
    // 供应商响应超时：本地显式 failed，保留可读原因，不假成功
    expect(timedOut.status).toBe("failed");
    expect(timedOut.failureCode).toBe("PROVIDER_TIMEOUT");
    expect(timedOut.failureReason).toContain("超时");

    const recovered = await retryPublishRecord(userAId, record.id);
    expect(recovered.status).toBe("submitted");
    const persisted = await prisma.publishRecord.findUnique({ where: { id: record.id } });
    const raw = persisted?.providerResponse as Record<string, unknown>;
    // 超时重试按同一幂等键恢复既有任务：供应商收到两次 createFlow，但任务只有一个
    expect(raw.createFlowCalls).toBe(2);
    expect(persisted?.providerRecordId).toMatch(/^mock-record-/);
  });

  it("cancels an in-flight record and protects final states from any further action", async () => {
    const record = await preparePublishRecord(
      userAId,
      { contentId: xhsContentId, accountId: "mock-xhs-active", assets: IMAGE_ASSETS },
      `c10-cancel-${runId}`,
    );
    const submitted = await submitPublishRecord(userAId, record.id);
    expect(submitted.status).toBe("submitted");

    const canceled = await cancelPublishRecord(userAId, record.id);
    expect(canceled.status).toBe("canceled");
    // 终态：不可再取消、不可重试、不可重复提交
    await expect(cancelPublishRecord(userAId, record.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(retryPublishRecord(userAId, record.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const resubmitted = await submitPublishRecord(userAId, record.id);
    expect(resubmitted.status).toBe("canceled");

    // published 同样拒绝取消
    const publishedRecord = await preparePublishRecord(
      userAId,
      { contentId: xhsContentId, accountId: "mock-xhs-active", assets: IMAGE_ASSETS },
      `c10-published-${runId}`,
    );
    await prisma.publishRecord.update({
      where: { id: publishedRecord.id },
      data: { status: "published", publishedAt: new Date() },
    });
    await expect(cancelPublishRecord(userAId, publishedRecord.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("cross-user isolation and secret hygiene", () => {
  it("blocks user B from reading, retrying or canceling user A's records", async () => {
    const record = await preparePublishRecord(
      userAId,
      { contentId: douyinContentId, accountId: "mock-douyin-active", assets: VIDEO_ASSETS },
      `c10-isolation-${runId}`,
    );
    await expect(getPublishRecord(userBId, record.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(retryPublishRecord(userBId, record.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(cancelPublishRecord(userBId, record.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(submitPublishRecord(userBId, record.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("gates user B's asset signing on their own missing connection", async () => {
    // B 未配置凭证：即使 A 已连接，B 依旧收到显式 connection_required
    await expect(resolvePublishingProvider(userBId)).rejects.toMatchObject({
      code: "CREDENTIAL_NOT_CONFIGURED",
      details: { reason: "connection_required" },
    });
  });

  it("never leaks the stored credential through public record payloads", async () => {
    const record = await preparePublishRecord(
      userAId,
      { contentId: douyinContentId, accountId: "mock-douyin-active", assets: VIDEO_ASSETS },
      `c10-hygiene-${runId}`,
    );
    const submitted = await submitPublishRecord(userAId, record.id);
    const serialized = JSON.stringify(submitted).toLowerCase();
    expect(serialized).not.toContain(`mock-fixture-key-${runId}`.toLowerCase());
    expect(serialized).not.toContain("apikey");
    expect(serialized).not.toContain("x-api-key");
    expect(serialized).not.toContain("encryptedpayload");
  });
});
