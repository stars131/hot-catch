import type { Platform } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { AITOEARN_METADATA } from "@/lib/providers/aitoearn/metadata";
import { normalizeAccounts } from "@/lib/providers/aitoearn/normalizer";
import type {
  AssetUploadSignature,
  ProviderPublishRecord,
  ProviderPublishStatus,
  PublishingAccount,
  PublishingProvider,
  PublishFlowInput,
} from "@/lib/providers/types";

/**
 * C10 本地模拟供应商：只在内存里执行发布状态机，绝不发起任何网络请求，
 * 绝不持有 API Key，绝不产生 published（模拟模式不声称真实发布成功）。
 *
 * 行为契约（与 tests/fixtures/aitoearn/*.json 对齐，契约测试防漂移）：
 * - createFlow 按 idempotencyKey 幂等：同键重复提交返回既有记录，不重复创建；
 * - 账号 ID 含 "timeout"：首次提交已在供应商侧登记后抛超时错误，
 *   用于验证「超时先查询/按幂等键恢复，不盲目重发」；
 * - 账号 ID 含 "fail"：首次提交后查询返回 failed，重试一次后恢复正常推进；
 * - 抖音记录查询后进入 awaiting_user，短链与 user-action.json 夹具一致；
 * - 小红书记录停留在 submitted（供应商处理中），可用于取消路径演示。
 */

export const MOCK_DOUYIN_SHORT_LINK = "https://v.douyin.com/fixture/";

/** 形状与真实 /api/v2/channels/accounts 响应一致，走同一个归一化器。 */
const MOCK_ACCOUNTS_RESPONSE = {
  code: 0,
  data: {
    list: [
      {
        id: "mock-xhs-active",
        type: "xiaohongshu",
        nickname: "模拟小红书账号",
        account: "mock_xhs_account",
        status: 0,
      },
      {
        id: "mock-douyin-active",
        type: "douyin",
        nickname: "模拟抖音账号",
        account: "mock_douyin_account",
        status: 0,
      },
      {
        id: "mock-douyin-fail",
        type: "douyin",
        nickname: "模拟失败账号（演示重试）",
        account: "mock_douyin_fail",
        status: 0,
      },
    ],
  },
};

type MockPublishState = {
  flowId: string;
  recordId: string;
  platform: Platform;
  accountId: string;
  idempotencyKey: string;
  status: ProviderPublishStatus;
  shortLink?: string;
  failureCode?: string;
  failureReason?: string;
  queryCount: number;
  retryCount: number;
  createFlowCalls: number;
  history: Array<{ status: ProviderPublishStatus; at: string }>;
};

export class MockAiToEarnStore {
  readonly recordIdByIdempotencyKey = new Map<string, string>();
  readonly records = new Map<string, MockPublishState>();
  readonly assets = new Map<string, string>();
  counter = 0;

  reset() {
    this.recordIdByIdempotencyKey.clear();
    this.records.clear();
    this.assets.clear();
    this.counter = 0;
  }
}

/**
 * dev server 内共享，保证跨请求/跨路由幂等；测试可传入独立 store 隔离。
 * 必须挂在 globalThis 上：Next.js 会把每个 API 路由独立打包，
 * 普通模块级单例在不同路由 bundle 中是不同实例，会让模拟状态跨路由失忆。
 */
const globalForMockStore = globalThis as unknown as {
  __aitoearnMockStore?: MockAiToEarnStore;
};
const globalMockStore =
  globalForMockStore.__aitoearnMockStore ?? new MockAiToEarnStore();
globalForMockStore.__aitoearnMockStore = globalMockStore;

export class MockAiToEarnProvider implements PublishingProvider {
  readonly name = "aitoearn-mock";

  constructor(private readonly store: MockAiToEarnStore = globalMockStore) {}

  getMetadata() {
    return AITOEARN_METADATA;
  }

  async getAuthorizationUrl(platform: Platform) {
    return {
      authorizationUrl: `https://auth.aitoearn.test/oauth/${platform}?state=mock-fixture`,
      sessionId: "mock-auth-session-1",
    };
  }

  async getAuthorizationStatus() {
    return { status: "pending", simulated: true };
  }

  async listAccounts(): Promise<PublishingAccount[]> {
    return normalizeAccounts(MOCK_ACCOUNTS_RESPONSE);
  }

  async signAssetUpload(input: {
    fileName: string;
    contentType: string;
    size: number;
  }): Promise<AssetUploadSignature> {
    const assetId = `mock-asset-${++this.store.counter}`;
    // .invalid 顶级域保证不可解析：即使前端误发起真实上传也会立刻失败。
    const assetUrl = `https://mock.aitoearn.invalid/assets/${assetId}/${encodeURIComponent(input.fileName)}`;
    this.store.assets.set(assetId, assetUrl);
    return {
      assetId,
      uploadUrl: `https://mock.aitoearn.invalid/upload/${assetId}`,
      method: "PUT",
      assetUrl,
      simulated: true,
    };
  }

  async confirmAssetUpload(assetId: string) {
    const assetUrl = this.store.assets.get(assetId);
    if (!assetUrl) {
      throw new AppError("PROVIDER_ERROR", "模拟素材不存在或已过期。", 404);
    }
    return { assetId, assetUrl };
  }

  async createFlow(input: PublishFlowInput): Promise<ProviderPublishRecord> {
    const existingId = this.store.recordIdByIdempotencyKey.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.mustGet(existingId);
      existing.createFlowCalls += 1;
      return this.snapshot(existing);
    }

    const sequence = ++this.store.counter;
    const state: MockPublishState = {
      flowId: `mock-flow-${sequence}`,
      recordId: `mock-record-${sequence}`,
      platform: input.platform,
      accountId: input.accountId,
      idempotencyKey: input.idempotencyKey,
      status: input.scheduledAt ? "scheduled" : "submitted",
      queryCount: 0,
      retryCount: 0,
      createFlowCalls: 1,
      history: [],
    };
    this.pushHistory(state, state.status);
    this.store.recordIdByIdempotencyKey.set(input.idempotencyKey, state.recordId);
    this.store.records.set(state.recordId, state);

    if (input.accountId.includes("timeout")) {
      // 供应商已登记任务，但响应超时：调用方必须按幂等键恢复，不得盲目重发。
      throw new AppError(
        "PROVIDER_ERROR",
        "AiToEarn 提交超时（模拟）：响应未返回，任务可能已创建。",
        504,
        { failureCode: "PROVIDER_TIMEOUT", simulated: true },
      );
    }
    return this.snapshot(state);
  }

  async getRecord(recordId: string): Promise<ProviderPublishRecord> {
    const state = this.mustGet(recordId);
    state.queryCount += 1;
    this.advance(state);
    return this.snapshot(state);
  }

  async retry(recordId: string): Promise<ProviderPublishRecord> {
    const state = this.mustGet(recordId);
    // 查询先于重试：非 failed 一律返回当前状态，绝不重复提交。
    if (state.status !== "failed") return this.snapshot(state);
    state.retryCount += 1;
    state.status = "submitted";
    state.failureCode = undefined;
    state.failureReason = undefined;
    this.pushHistory(state, "submitted");
    return this.getRecord(recordId);
  }

  async cancel(recordId: string): Promise<void> {
    const state = this.mustGet(recordId);
    if (state.status === "published") {
      throw new AppError("CONFLICT", "作品已发布，供应商拒绝取消。", 409);
    }
    if (state.status === "canceled") return;
    state.status = "canceled";
    this.pushHistory(state, "canceled");
  }

  /** 惰性推进：只有查询才会让状态前进，模拟真实轮询节奏。 */
  private advance(state: MockPublishState) {
    if (state.status !== "submitted") return;
    if (state.accountId.includes("fail") && state.retryCount === 0) {
      state.status = "failed";
      state.failureCode = "MOCK_PUBLISH_REJECTED";
      state.failureReason = "模拟发布被平台拒绝（契约夹具），可重试验证恢复路径。";
      this.pushHistory(state, "failed");
      return;
    }
    if (state.platform === "douyin") {
      state.status = "awaiting_user";
      state.shortLink = MOCK_DOUYIN_SHORT_LINK;
      this.pushHistory(state, "awaiting_user");
    }
    // 小红书保持 submitted：模拟模式不声称真实发布成功。
  }

  private mustGet(recordId: string): MockPublishState {
    const state = this.store.records.get(recordId);
    if (!state) {
      throw new AppError("PROVIDER_ERROR", "模拟发布记录不存在。", 404);
    }
    return state;
  }

  private pushHistory(state: MockPublishState, status: ProviderPublishStatus) {
    state.history.push({ status, at: new Date().toISOString() });
  }

  private snapshot(state: MockPublishState): ProviderPublishRecord {
    return {
      flowId: state.flowId,
      recordId: state.recordId,
      status: state.status,
      shortLink: state.shortLink,
      failureCode: state.failureCode,
      failureReason: state.failureReason,
      raw: {
        simulated: true,
        provider: this.name,
        idempotencyKey: state.idempotencyKey,
        queryCount: state.queryCount,
        retryCount: state.retryCount,
        createFlowCalls: state.createFlowCalls,
        history: [...state.history],
      },
    };
  }
}
