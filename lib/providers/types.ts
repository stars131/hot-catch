import type { Platform } from "@prisma/client";
import type { ZodType } from "zod";

export type ReferenceKind = "account" | "content" | "webpage";

export type ParsedReference = {
  platform: Platform | null;
  kind: ReferenceKind;
  sourceUrl: string;
  platformAccountId?: string;
  platformContentId?: string;
  canonicalUrl?: string;
};

export type SocialAccount = {
  platform: Platform;
  platformAccountId: string;
  nickname?: string;
  avatarUrl?: string;
  profileUrl?: string;
  description?: string;
  followerCount?: number;
  followingCount?: number;
  likedCount?: number;
  contentCount?: number;
  raw: unknown;
};

export type SocialContent = {
  platform: Platform;
  platformContentId: string;
  platformAccountId?: string;
  sourceUrl?: string;
  title?: string;
  body?: string;
  contentType?: string;
  coverUrl?: string;
  mediaUrl?: string;
  durationSec?: number;
  publishedAt?: Date;
  metrics: SocialMetrics;
  raw: unknown;
};

export type SocialMetrics = {
  views?: number;
  likes?: number;
  collects?: number;
  comments?: number;
  shares?: number;
};

export type CursorPage<T> = {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
};

export interface SocialDataProvider {
  readonly name: string;
  parseReference(input: string): Promise<ParsedReference>;
  getAccount(reference: ParsedReference): Promise<SocialAccount>;
  listAccountContent(
    account: SocialAccount,
    cursor?: string,
  ): Promise<CursorPage<SocialContent>>;
  getContent(reference: ParsedReference): Promise<SocialContent>;
  refreshMetrics(reference: ParsedReference): Promise<SocialMetrics>;
}

export type TranscriptionInput = {
  sourceUrl: string;
  language?: string;
  idempotencyKey: string;
};

export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
};

export type TranscriptionResult = {
  text: string;
  segments: TranscriptSegment[];
  providerJobId?: string;
  raw?: unknown;
};

export interface TranscriptionProvider {
  readonly name: string;
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}

export type PublishingAccount = {
  id: string;
  platform: Platform;
  name: string;
  avatarUrl?: string;
  status: "active" | "expired" | "invalid";
  raw?: unknown;
};

export type AssetUploadSignature = {
  assetId: string;
  uploadUrl: string;
  method: "PUT" | "POST";
  headers?: Record<string, string>;
  fields?: Record<string, string>;
  assetUrl?: string;
  expiresAt?: Date;
  /** true = 模拟签名（mock 模式）：客户端必须跳过真实直传，不得向 uploadUrl 发送文件。 */
  simulated?: boolean;
};

export type PublishFlowInput = {
  platform: Platform;
  accountId: string;
  idempotencyKey: string;
  scheduledAt?: Date;
  payload: Record<string, unknown>;
};

export type ProviderPublishStatus =
  | "scheduled"
  | "uploading"
  | "submitted"
  | "awaiting_user"
  | "published"
  | "failed"
  | "canceled";

export type ProviderPublishRecord = {
  flowId?: string;
  recordId: string;
  status: ProviderPublishStatus;
  shortLink?: string;
  publicUrl?: string;
  failureCode?: string;
  failureReason?: string;
  raw?: unknown;
};

/** 平台发布规则:本地保守约束,供前端提示与提交前校验;不代表供应商实时配额。 */
export type PlatformPublishRules = {
  platform: Platform;
  displayName: string;
  assetTypes: Array<"image" | "video">;
  maxAssets: number;
  minAssets: number;
  maxTitleLength: number;
  maxBodyLength: number;
  maxAssetSizeMb: number;
  supportsSchedule: boolean;
  notes?: string;
};

/** 供应商连接元数据:静态描述,不包含任何凭证信息。 */
export type ProviderConnectionMetadata = {
  provider: string;
  displayName: string;
  capabilities: string[];
  platforms: readonly PlatformPublishRules[];
};

export interface PublishingProvider {
  readonly name: string;
  /** 本地静态元数据与平台规则;不触发网络请求。 */
  getMetadata(): ProviderConnectionMetadata;
  getAuthorizationUrl(platform: Platform): Promise<{
    authorizationUrl: string;
    sessionId: string;
  }>;
  /** 轮询授权会话结果;sessionId 由 getAuthorizationUrl 返回。 */
  getAuthorizationStatus(platform: Platform, sessionId: string): Promise<unknown>;
  listAccounts(): Promise<PublishingAccount[]>;
  signAssetUpload(input: {
    fileName: string;
    contentType: string;
    size: number;
  }): Promise<AssetUploadSignature>;
  confirmAssetUpload(assetId: string): Promise<{ assetId: string; assetUrl: string }>;
  createFlow(input: PublishFlowInput): Promise<ProviderPublishRecord>;
  /** D+1/D+3/D+7 指标采集入口；mock 实现必须返回带 simulated 标记的夹具数据。 */
  getWorkAnalytics(platform: Platform, platformWorkId: string): Promise<unknown>;
  getRecord(recordId: string): Promise<ProviderPublishRecord>;
  retry(recordId: string): Promise<ProviderPublishRecord>;
  cancel(recordId: string): Promise<void>;
}

export interface LlmProvider {
  readonly name: string;
  generateText(input: {
    system: string;
    prompt: string;
    temperature?: number;
  }): Promise<string>;
  generateStructured<T>(input: {
    system: string;
    prompt: string;
    schema: ZodType<T>;
    temperature?: number;
  }): Promise<T>;
}

export interface WebReferenceProvider {
  readonly name: string;
  importUrl(url: string): Promise<{
    title?: string;
    markdown: string;
    metadata?: Record<string, unknown>;
  }>;
}
