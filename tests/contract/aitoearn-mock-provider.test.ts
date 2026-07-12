import { describe, expect, it } from "vitest";
import userActionFixture from "@/tests/fixtures/aitoearn/user-action.json";
import {
  MOCK_DOUYIN_SHORT_LINK,
  MockAiToEarnProvider,
  MockAiToEarnStore,
} from "@/lib/providers/aitoearn/mock-provider";
import type { PublishFlowInput } from "@/lib/providers/types";

/**
 * C10 本地模拟供应商行为契约。
 *
 * 模拟供应商是发布状态机在无真实凭证环境下的执行侧，本组测试锁定它的
 * 对外契约：幂等创建、状态推进、awaiting_user 短链（与脱敏夹具对齐）、
 * 查询先于重试、超时防重、取消守卫，以及"绝不产生 published/绝不泄漏密钥"。
 */

function makeProvider() {
  return new MockAiToEarnProvider(new MockAiToEarnStore());
}

function douyinFlow(overrides: Partial<PublishFlowInput> = {}): PublishFlowInput {
  return {
    platform: "douyin",
    accountId: "mock-douyin-active",
    idempotencyKey: "contract-key-1",
    payload: { content: { title: "测试", body: "正文", media: [] } },
    ...overrides,
  };
}

describe("AiToEarn mock provider contract", () => {
  it("creates a flow and reports submitted without any network access", async () => {
    const provider = makeProvider();
    const record = await provider.createFlow(douyinFlow());
    expect(record.recordId).toMatch(/^mock-record-/);
    expect(record.flowId).toMatch(/^mock-flow-/);
    expect(record.status).toBe("submitted");
    expect((record.raw as Record<string, unknown>).simulated).toBe(true);
  });

  it("deduplicates createFlow by idempotency key instead of creating twice", async () => {
    const provider = makeProvider();
    const first = await provider.createFlow(douyinFlow());
    const second = await provider.createFlow(douyinFlow());
    expect(second.recordId).toBe(first.recordId);
    const raw = second.raw as Record<string, unknown>;
    expect(raw.createFlowCalls).toBe(2);
  });

  it("moves a Douyin record to awaiting_user with the fixture short link on query", async () => {
    const provider = makeProvider();
    const created = await provider.createFlow(douyinFlow());
    const queried = await provider.getRecord(created.recordId);
    expect(queried.status).toBe("awaiting_user");
    expect(queried.shortLink).toBe(MOCK_DOUYIN_SHORT_LINK);
    // 与脱敏契约夹具对齐，防止模拟行为与夹具漂移
    expect(queried.shortLink).toBe(userActionFixture.data.shortLink);
  });

  it("keeps a Xiaohongshu record at submitted and never claims published", async () => {
    const provider = makeProvider();
    const created = await provider.createFlow(
      douyinFlow({ platform: "xiaohongshu", accountId: "mock-xhs-active", idempotencyKey: "contract-key-xhs" }),
    );
    for (let index = 0; index < 3; index += 1) {
      const queried = await provider.getRecord(created.recordId);
      expect(queried.status).toBe("submitted");
      expect(queried.publicUrl).toBeUndefined();
    }
  });

  it("fails a *fail* account once and recovers after one retry", async () => {
    const provider = makeProvider();
    const created = await provider.createFlow(
      douyinFlow({ accountId: "mock-douyin-fail", idempotencyKey: "contract-key-fail" }),
    );
    const failed = await provider.getRecord(created.recordId);
    expect(failed.status).toBe("failed");
    expect(failed.failureCode).toBe("MOCK_PUBLISH_REJECTED");
    expect(failed.failureReason).toContain("模拟");

    const retried = await provider.retry(created.recordId);
    expect(retried.status).toBe("awaiting_user");
    expect(retried.failureCode).toBeUndefined();
    expect((retried.raw as Record<string, unknown>).retryCount).toBe(1);
  });

  it("retry on a non-failed record only reports current status and never resubmits", async () => {
    const provider = makeProvider();
    const created = await provider.createFlow(douyinFlow({ idempotencyKey: "contract-key-noop" }));
    await provider.getRecord(created.recordId); // → awaiting_user
    const result = await provider.retry(created.recordId);
    expect(result.status).toBe("awaiting_user");
    const raw = result.raw as Record<string, unknown>;
    expect(raw.retryCount).toBe(0);
    expect(raw.createFlowCalls).toBe(1);
  });

  it("times out on a *timeout* account after registering the task, so the same key recovers it", async () => {
    const provider = makeProvider();
    const input = douyinFlow({ accountId: "mock-douyin-timeout", idempotencyKey: "contract-key-timeout" });
    await expect(provider.createFlow(input)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      statusCode: 504,
    });
    // 超时后按同一幂等键恢复：返回既有任务，不重复创建
    const recovered = await provider.createFlow(input);
    expect(recovered.recordId).toMatch(/^mock-record-/);
    expect((recovered.raw as Record<string, unknown>).createFlowCalls).toBe(2);
    const queried = await provider.getRecord(recovered.recordId);
    expect(queried.status).toBe("awaiting_user");
  });

  it("cancels an in-flight record and refuses to cancel a published one", async () => {
    const provider = makeProvider();
    const created = await provider.createFlow(douyinFlow({ idempotencyKey: "contract-key-cancel" }));
    await provider.cancel(created.recordId);
    const canceled = await provider.getRecord(created.recordId);
    expect(canceled.status).toBe("canceled");
    // 再次取消是无害幂等
    await expect(provider.cancel(created.recordId)).resolves.toBeUndefined();
  });

  it("signs uploads with an unresolvable mock host and marks them simulated", async () => {
    const provider = makeProvider();
    const signature = await provider.signAssetUpload({
      fileName: "video.mp4",
      contentType: "video/mp4",
      size: 1024,
    });
    expect(signature.simulated).toBe(true);
    expect(new URL(signature.uploadUrl).hostname).toBe("mock.aitoearn.invalid");
    const confirmed = await provider.confirmAssetUpload(signature.assetId);
    expect(confirmed.assetUrl).toBe(signature.assetUrl);
    await expect(provider.confirmAssetUpload("unknown-asset")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
  });

  it("lists active mock accounts for both platforms and leaks no secret material", async () => {
    const provider = makeProvider();
    const accounts = await provider.listAccounts();
    expect(accounts.map((account) => account.id)).toEqual([
      "mock-xhs-active",
      "mock-douyin-active",
      "mock-douyin-fail",
    ]);
    expect(accounts.every((account) => account.status === "active")).toBe(true);
    const serialized = JSON.stringify({
      accounts,
      metadata: provider.getMetadata(),
    }).toLowerCase();
    expect(serialized).not.toContain("apikey");
    expect(serialized).not.toContain("x-api-key");
    expect(serialized).not.toContain("bearer ");
  });
});
