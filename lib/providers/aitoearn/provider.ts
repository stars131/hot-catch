import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { providerFetchJson } from "@/lib/providers/http";
import type {
  AssetUploadSignature,
  ProviderPublishRecord,
  PublishingAccount,
  PublishingProvider,
  PublishFlowInput,
} from "@/lib/providers/types";
import {
  asRecord,
  normalizeAccounts,
  normalizePublishRecord,
  stringValue,
  unwrapData,
} from "@/lib/providers/aitoearn/normalizer";
import { AITOEARN_METADATA } from "@/lib/providers/aitoearn/metadata";
import type { Platform } from "@prisma/client";

export class AiToEarnProvider implements PublishingProvider {
  readonly name = "aitoearn";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = env.AITO_EARN_BASE_URL,
  ) {}

  getMetadata() {
    return AITOEARN_METADATA;
  }

  async getAuthorizationUrl(platform: Platform) {
    const data = asRecord(
      unwrapData(
        await this.request(
          "GET",
          `/api/v2/channels/accounts/auth/${platform}`,
          undefined,
          { redirectUri: `${env.NEXT_PUBLIC_APP_URL}/settings/connections` },
        ),
      ),
    );
    const authorizationUrl = stringValue(data.url);
    const sessionId = stringValue(data.sessionId);
    if (!authorizationUrl || !sessionId) {
      throw new AppError("PROVIDER_ERROR", "AiToEarn 授权响应缺少 URL 或 sessionId。", 502);
    }
    return { authorizationUrl, sessionId };
  }

  async getAuthorizationStatus(platform: Platform, sessionId: string) {
    return unwrapData(
      await this.request(
        "GET",
        `/api/v2/channels/accounts/auth/${platform}/status/${encodeURIComponent(sessionId)}`,
      ),
    );
  }

  async listAccounts(): Promise<PublishingAccount[]> {
    return normalizeAccounts(await this.request("GET", "/api/v2/channels/accounts"));
  }

  async getWorkAnalytics(platform: Platform, platformWorkId: string) {
    return unwrapData(
      await this.request(
        "GET",
        `/api/v2/channels/works/${platform}/${encodeURIComponent(platformWorkId)}/analytics`,
      ),
    );
  }

  async signAssetUpload(input: {
    fileName: string;
    contentType: string;
    size: number;
  }): Promise<AssetUploadSignature> {
    const data = asRecord(
      unwrapData(
        await this.request("POST", "/api/assets/uploadSign", {
          filename: input.fileName,
          type: "temp",
          size: input.size,
          mimeType: input.contentType,
        }),
      ),
    );
    const assetId = stringValue(data.id);
    const uploadUrl = stringValue(data.uploadUrl);
    if (!assetId || !uploadUrl) {
      throw new AppError("PROVIDER_ERROR", "AiToEarn 上传签名响应不完整。", 502);
    }
    return {
      assetId,
      uploadUrl,
      method: Object.keys(asRecord(data.uploadFields)).length ? "POST" : "PUT",
      fields: Object.fromEntries(
        Object.entries(asRecord(data.uploadFields)).map(([key, value]) => [key, String(value)]),
      ),
      assetUrl: stringValue(data.url) || undefined,
    };
  }

  async confirmAssetUpload(assetId: string) {
    const data = asRecord(
      unwrapData(
        await this.request("POST", `/api/assets/${encodeURIComponent(assetId)}/confirm`),
      ),
    );
    const assetUrl = stringValue(data.url);
    if (!assetUrl) throw new AppError("PROVIDER_ERROR", "AiToEarn 未返回素材 URL。", 502);
    return { assetId: stringValue(data.id) || assetId, assetUrl };
  }

  async createFlow(input: PublishFlowInput): Promise<ProviderPublishRecord> {
    const body = {
      ...input.payload,
      ...(input.scheduledAt ? { publishAt: input.scheduledAt.toISOString() } : {}),
      context: {
        ...asRecord(asRecord(input.payload).context),
        source: "startrace",
        idempotencyKey: input.idempotencyKey,
      },
    };
    const data = asRecord(
      unwrapData(await this.request("POST", "/api/v2/channels/publish/flows", body)),
    );
    const flowId = stringValue(data.flowId);
    const task = asRecord(Array.isArray(data.tasks) ? data.tasks[0] : undefined);
    const taskId = stringValue(task.id);
    if (!flowId || !taskId) {
      throw new AppError("PROVIDER_ERROR", "AiToEarn Flow 响应缺少 flowId 或 taskId。", 502);
    }
    return {
      flowId,
      recordId: taskId,
      status: input.scheduledAt ? "scheduled" : "submitted",
      raw: data,
    };
  }

  async getRecord(recordId: string): Promise<ProviderPublishRecord> {
    const record = normalizePublishRecord(
      await this.request(
        "GET",
        `/api/v2/channels/publish/records/${encodeURIComponent(recordId)}`,
      ),
    );
    if (record.status === "awaiting_user") {
      const action = asRecord(
        unwrapData(
          await this.request(
            "GET",
            `/api/v2/channels/publish/records/${encodeURIComponent(record.recordId)}/user-action`,
          ),
        ),
      );
      record.shortLink = stringValue(action.shortLink) || stringValue(action.schemeUrl) || undefined;
    }
    return record;
  }

  async retry(recordId: string): Promise<ProviderPublishRecord> {
    const current = normalizePublishRecord(
      await this.request(
        "GET",
        `/api/v2/channels/publish/records/${encodeURIComponent(recordId)}`,
      ),
    );
    const taskId = stringValue(asRecord(unwrapData(current.raw)).taskId) || recordId;
    await this.request(
      "POST",
      `/api/v2/channels/publish/tasks/${encodeURIComponent(taskId)}/retry`,
    );
    return this.getRecord(recordId);
  }

  async cancel(recordId: string): Promise<void> {
    const current = normalizePublishRecord(
      await this.request(
        "GET",
        `/api/v2/channels/publish/records/${encodeURIComponent(recordId)}`,
      ),
    );
    const taskId = stringValue(asRecord(unwrapData(current.raw)).taskId) || recordId;
    await this.request(
      "DELETE",
      `/api/v2/channels/publish/tasks/${encodeURIComponent(taskId)}`,
    );
  }

  private async request(
    method: "GET" | "POST" | "DELETE",
    pathname: string,
    body?: unknown,
    searchParams?: Record<string, string>,
  ) {
    const url = new URL(pathname, this.baseUrl);
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (value) url.searchParams.set(key, value);
    }
    return providerFetchJson(
      url,
      {
        method,
        headers: {
          "X-Api-Key": this.apiKey,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
      this.name,
    );
  }
}
