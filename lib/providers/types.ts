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

export interface PublishingProvider {
  readonly name: string;
  getAuthorizationUrl(platform: Platform): Promise<{
    authorizationUrl: string;
    sessionId: string;
  }>;
  listAccounts(): Promise<PublishingAccount[]>;
  signAssetUpload(input: {
    fileName: string;
    contentType: string;
    size: number;
  }): Promise<AssetUploadSignature>;
  confirmAssetUpload(assetId: string): Promise<{ assetId: string; assetUrl: string }>;
  createFlow(input: PublishFlowInput): Promise<ProviderPublishRecord>;
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
