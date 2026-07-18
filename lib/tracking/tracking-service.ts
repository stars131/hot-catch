import { createHash } from "node:crypto";
import {
  CredentialProvider,
  JobType,
  Platform,
  Prisma,
  TrackingMetricSource,
  TrackingOwnership,
} from "@prisma/client";
import { z } from "zod";
import { detectUrl } from "@/lib/creator/url-detection";
import { AppError, isAppError } from "@/lib/errors";
import { enqueueJob } from "@/lib/jobs/queues";
import { prisma } from "@/lib/prisma";
import { createLlmProvider } from "@/lib/providers/factory";
import { providerFetchJson } from "@/lib/providers/http";
import { TikHubProvider } from "@/lib/providers/tikhub/provider";
import type { SocialMetrics } from "@/lib/providers/types";
import { assertUrlSafe, extractHtmlSummary, safeFetchText } from "@/lib/security/url-guard";
import { loadCredential } from "@/lib/services/credential-service";

const TRACKING_ANALYSIS_PROMPT = "tracking-analysis/v1";
const DAY_MS = 24 * 60 * 60 * 1_000;

export const createTrackingSchema = z
  .object({
    url: z.string().trim().url().max(2_000),
    ownership: z.nativeEnum(TrackingOwnership).default(TrackingOwnership.owned),
    title: z.string().trim().max(300).optional(),
  })
  .strict();

export const manualMetricsSchema = z
  .object({
    observedAt: z.coerce.date().optional(),
    viewCount: z.number().int().min(0).optional(),
    likeCount: z.number().int().min(0).optional(),
    collectCount: z.number().int().min(0).optional(),
    commentCount: z.number().int().min(0).optional(),
    shareCount: z.number().int().min(0).optional(),
    saveCount: z.number().int().min(0).optional(),
    clickCount: z.number().int().min(0).optional(),
    followerDelta: z.number().int().optional(),
  })
  .strict()
  .refine(
    (value) =>
      Object.entries(value).some(
        ([key, item]) => key !== "observedAt" && typeof item === "number",
      ),
    "请至少填写一个指标。",
  );

const trackingAnalysisSchema = z
  .object({
    summary: z.string().trim().min(1).max(1_000),
    findings: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
    recommendations: z.array(z.string().trim().min(1).max(500)).min(1).max(8),
  })
  .strict();

export async function listTrackedPublications(userId: string) {
  return prisma.trackedPublication.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    include: {
      metricSnapshots: { orderBy: { observedAt: "desc" }, take: 12 },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

export async function createTrackedPublication(userId: string, input: unknown) {
  const parsed = createTrackingSchema.parse(input);
  const safeUrl = await assertUrlSafe(parsed.url);
  const detected = detectUrl(safeUrl);
  if (detected.kind === "account") {
    throw new AppError(
      "VALIDATION_ERROR",
      "请提供具体帖子、视频或文章链接，不要提供账号主页。",
      400,
    );
  }
  const platform = detected.platform === "web" ? null : Platform[detected.platform];
  const platformContentId = extractPlatformContentId(detected.platform, safeUrl);
  const fingerprint = createHash("sha256").update(safeUrl).digest("hex");
  const existing = await prisma.trackedPublication.findUnique({
    where: { userId_urlFingerprint: { userId, urlFingerprint: fingerprint } },
    include: {
      metricSnapshots: { orderBy: { observedAt: "desc" }, take: 12 },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (existing) return { publication: existing, created: false, jobId: null };

  const preview = await readPublicPreview(safeUrl);
  const canSync = await hasTrackingCredential(userId, platform);
  const status = canSync
    ? "pending"
    : platform
      ? "connection_required"
      : "active";
  const publication = await prisma.trackedPublication.create({
    data: {
      userId,
      platform,
      sourceKind: detected.platform === "web" ? "web_article" : "social_post",
      ownership: parsed.ownership,
      status,
      publicUrl: safeUrl,
      urlFingerprint: fingerprint,
      platformContentId,
      title: parsed.title || preview.title || null,
      excerpt: preview.excerpt || null,
      metadata: {
        detectedKind: detected.kind,
        importNote:
          detected.platform === "web"
            ? "网页文章已保存；可手工补充指标并进行内容复盘。"
            : undefined,
      },
    },
  });

  let jobId: string | null = null;
  if (canSync) {
    const job = await enqueueTrackingSync(userId, publication.id, "initial");
    jobId = job.id;
  }
  return { publication, created: true, jobId };
}

export async function enqueueTrackingRefresh(userId: string, publicationId: string) {
  const publication = await mustOwnPublication(userId, publicationId);
  if (publication.status === "paused") {
    throw new AppError("CONFLICT", "该作品已暂停跟踪，请先恢复。", 409);
  }
  if (!(await hasTrackingCredential(userId, publication.platform))) {
    await prisma.trackedPublication.update({
      where: { id: publication.id },
      data: {
        status: "connection_required",
        lastError: trackingConnectionMessage(publication.platform),
      },
    });
    throw new AppError(
      "CREDENTIAL_NOT_CONFIGURED",
      trackingConnectionMessage(publication.platform),
      422,
    );
  }
  return enqueueTrackingSync(userId, publication.id, fifteenMinuteBucket());
}

export async function saveManualMetrics(
  userId: string,
  publicationId: string,
  input: unknown,
) {
  const parsed = manualMetricsSchema.parse(input);
  const publication = await mustOwnPublication(userId, publicationId);
  const observedAt = parsed.observedAt ?? new Date();
  const bucketKey = `manual:${observedAt.toISOString()}`;
  const snapshot = await prisma.trackedMetricSnapshot.create({
    data: {
      userId,
      trackedPublicationId: publication.id,
      source: TrackingMetricSource.manual,
      bucketKey,
      observedAt,
      ...withoutObservedAt(parsed),
      rawData: { enteredByUser: true },
    },
  });
  await prisma.trackedPublication.update({
    where: { id: publication.id },
    data: { status: "active", lastSyncedAt: observedAt, lastError: null },
  });
  return snapshot;
}

export async function setTrackingPaused(
  userId: string,
  publicationId: string,
  paused: boolean,
) {
  await mustOwnPublication(userId, publicationId);
  return prisma.trackedPublication.update({
    where: { id: publicationId },
    data: {
      status: paused ? "paused" : "active",
      nextSyncAt: paused ? null : new Date(),
      lastError: null,
    },
  });
}

export async function deleteTrackedPublication(userId: string, publicationId: string) {
  await mustOwnPublication(userId, publicationId);
  await prisma.trackedPublication.delete({ where: { id: publicationId } });
}

export async function analyzeTrackedPublication(userId: string, publicationId: string) {
  const publication = await prisma.trackedPublication.findFirst({
    where: { id: publicationId, userId },
    include: { metricSnapshots: { orderBy: { observedAt: "asc" }, take: 50 } },
  });
  if (!publication) throw new AppError("NOT_FOUND", "跟踪作品不存在。", 404);
  const provider = await createLlmProvider(userId);
  const hasMetrics = publication.metricSnapshots.length > 0;
  const result = await provider.generateStructured({
    system: [
      "你是内容数据复盘顾问。仅根据提供的作品信息和真实指标快照进行分析。",
      "不得捏造缺失指标，不得把相关性描述成因果关系。若没有指标，只做内容层分析，并明确数据限制。",
      "建议必须具体、可验证、能用于下一次创作。只返回符合 Schema 的 JSON。",
    ].join("\n"),
    prompt: JSON.stringify(
      {
        work: {
          platform: publication.platform,
          sourceKind: publication.sourceKind,
          title: publication.title,
          excerpt: publication.excerpt,
          publicUrl: publication.publicUrl,
          ownership: publication.ownership,
          publishedAt: publication.publishedAt,
        },
        dataLimitation: hasMetrics
          ? null
          : "尚无真实指标，本次只能进行内容层复盘，不能判断实际传播表现。",
        snapshots: publication.metricSnapshots.map((snapshot) => ({
          source: snapshot.source,
          observedAt: snapshot.observedAt,
          viewCount: snapshot.viewCount,
          likeCount: snapshot.likeCount,
          collectCount: snapshot.collectCount,
          commentCount: snapshot.commentCount,
          shareCount: snapshot.shareCount,
          saveCount: snapshot.saveCount,
          clickCount: snapshot.clickCount,
          followerDelta: snapshot.followerDelta,
        })),
      },
      null,
      2,
    ),
    schema: trackingAnalysisSchema,
    temperature: 0.25,
  });
  return prisma.trackingAnalysis.create({
    data: {
      userId,
      trackedPublicationId: publication.id,
      status: hasMetrics ? "completed" : "limited",
      summary: result.summary,
      findings: result.findings,
      recommendations: result.recommendations,
      modelProvider: provider.name,
      modelName: provider.model,
      promptVersion: TRACKING_ANALYSIS_PROMPT,
    },
  });
}

export async function synchronizeTrackedPublication(
  userId: string,
  publicationId: string,
) {
  const publication = await mustOwnPublication(userId, publicationId);
  if (publication.status === "paused") {
    return { finalStatus: "succeeded" as const, publication };
  }
  try {
    const refreshed = await fetchTrackingMetrics(userId, publication);
    const observedAt = new Date();
    const bucketKey = `hour:${observedAt.toISOString().slice(0, 13)}`;
    const snapshot = await prisma.trackedMetricSnapshot.upsert({
      where: {
        trackedPublicationId_source_bucketKey: {
          trackedPublicationId: publication.id,
          source: refreshed.source,
          bucketKey,
        },
      },
      update: {
        ...refreshed.metrics,
        observedAt,
        rawData: refreshed.rawData as Prisma.InputJsonValue,
      },
      create: {
        userId,
        trackedPublicationId: publication.id,
        source: refreshed.source,
        bucketKey,
        observedAt,
        ...refreshed.metrics,
        rawData: refreshed.rawData as Prisma.InputJsonValue,
      },
    });
    const nextSyncAt = new Date(Date.now() + DAY_MS);
    await prisma.trackedPublication.update({
      where: { id: publication.id },
      data: {
        status: "active",
        title: refreshed.title || publication.title,
        excerpt: refreshed.excerpt || publication.excerpt,
        author: refreshed.author || publication.author,
        publishedAt: refreshed.publishedAt || publication.publishedAt,
        platformContentId: refreshed.platformContentId || publication.platformContentId,
        lastSyncedAt: observedAt,
        nextSyncAt,
        lastError: null,
      },
    });
    await enqueueTrackingSync(userId, publication.id, dayBucket(nextSyncAt), DAY_MS);
    return { finalStatus: "succeeded" as const, publication, snapshot };
  } catch (error) {
    const credentialMissing =
      isAppError(error) &&
      ["CREDENTIAL_NOT_CONFIGURED", "CREDENTIAL_INVALID"].includes(error.code);
    await prisma.trackedPublication.update({
      where: { id: publication.id },
      data: {
        status: credentialMissing ? "connection_required" : "unavailable",
        lastError: error instanceof Error ? error.message.slice(0, 500) : "指标同步失败。",
        nextSyncAt: null,
      },
    });
    if (credentialMissing) {
      return { finalStatus: "waiting_input" as const, publication };
    }
    throw error;
  }
}

async function fetchTrackingMetrics(
  userId: string,
  publication: Awaited<ReturnType<typeof mustOwnPublication>>,
) {
  if (publication.platform === Platform.youtube) {
    const videoId = publication.platformContentId || extractYouTubeVideoId(publication.publicUrl);
    if (!videoId) throw new AppError("VALIDATION_ERROR", "无法识别 YouTube 视频 ID。", 422);
    const credential = await loadCredential(userId, CredentialProvider.youtube_data);
    const apiKey = credential.apiKey ?? credential.token;
    if (!apiKey) throw new AppError("CREDENTIAL_INVALID", "YouTube Data API Key 缺失。", 422);
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
    endpoint.searchParams.set("part", "snippet,statistics");
    endpoint.searchParams.set("id", videoId);
    endpoint.searchParams.set("key", apiKey);
    const response = asRecord(await providerFetchJson(endpoint, {}, "youtube-data"));
    const item = Array.isArray(response.items) ? asRecord(response.items[0]) : {};
    const snippet = asRecord(item.snippet);
    const statistics = asRecord(item.statistics);
    if (!Object.keys(item).length) {
      throw new AppError("NOT_FOUND", "YouTube 未返回该视频，可能为私密或已删除。", 404);
    }
    return {
      source: TrackingMetricSource.public_api,
      platformContentId: videoId,
      title: stringValue(snippet.title),
      excerpt: stringValue(snippet.description).slice(0, 2_000),
      author: stringValue(snippet.channelTitle),
      publishedAt: dateValue(snippet.publishedAt),
      metrics: {
        viewCount: integerValue(statistics.viewCount),
        likeCount: integerValue(statistics.likeCount),
        commentCount: integerValue(statistics.commentCount),
      },
      rawData: { provider: "youtube-data", statistics },
    };
  }
  if (
    publication.platform === Platform.xiaohongshu ||
    publication.platform === Platform.douyin
  ) {
    const credential = await loadCredential(userId, CredentialProvider.tikhub);
    const apiKey = credential.apiKey ?? credential.token;
    if (!apiKey) throw new AppError("CREDENTIAL_INVALID", "TikHub API Key 缺失。", 422);
    const provider = new TikHubProvider(apiKey);
    const reference = await provider.parseReference(publication.publicUrl);
    const content = await provider.getContent(reference);
    return {
      source: TrackingMetricSource.provider,
      platformContentId: content.platformContentId,
      title: content.title ?? "",
      excerpt: content.body?.slice(0, 2_000) ?? "",
      author: "",
      publishedAt: content.publishedAt ?? null,
      metrics: normalizeSocialMetrics(content.metrics),
      rawData: { provider: provider.name, metrics: content.metrics },
    };
  }
  throw new AppError(
    "CREDENTIAL_NOT_CONFIGURED",
    trackingConnectionMessage(publication.platform),
    422,
  );
}

async function hasTrackingCredential(userId: string, platform: Platform | null) {
  const provider =
    platform === Platform.youtube
      ? CredentialProvider.youtube_data
      : platform === Platform.xiaohongshu || platform === Platform.douyin
        ? CredentialProvider.tikhub
        : null;
  if (!provider) return false;
  try {
    await loadCredential(userId, provider);
    return true;
  } catch {
    return false;
  }
}

async function readPublicPreview(url: string) {
  try {
    const result = await safeFetchText(url, { maxBytes: 512 * 1_024, timeoutMs: 8_000 });
    const summary = extractHtmlSummary(result.text);
    return { title: summary.title.slice(0, 300), excerpt: summary.text.slice(0, 2_000) };
  } catch {
    return { title: "", excerpt: "" };
  }
}

async function mustOwnPublication(userId: string, publicationId: string) {
  const publication = await prisma.trackedPublication.findFirst({
    where: { id: publicationId, userId },
  });
  if (!publication) throw new AppError("NOT_FOUND", "跟踪作品不存在。", 404);
  return publication;
}

function enqueueTrackingSync(
  userId: string,
  publicationId: string,
  bucket: string,
  delayMs?: number,
) {
  return enqueueJob({
    userId,
    type: JobType.metrics,
    action: "tracking.sync",
    input: { trackedPublicationId: publicationId },
    idempotencyKey: `tracking.sync:${publicationId}:${bucket}`,
    delayMs,
  });
}

function normalizeSocialMetrics(metrics: SocialMetrics) {
  return {
    viewCount: metrics.views,
    likeCount: metrics.likes,
    collectCount: metrics.collects,
    commentCount: metrics.comments,
    shareCount: metrics.shares,
  };
}

function extractPlatformContentId(platform: string, url: string) {
  if (platform === "youtube") return extractYouTubeVideoId(url);
  if (platform === "x") return new URL(url).pathname.match(/\/status\/(\d+)/)?.[1] ?? null;
  if (platform === "reddit") return new URL(url).pathname.match(/\/comments\/([^/]+)/)?.[1] ?? null;
  if (platform === "instagram") return new URL(url).pathname.match(/\/(?:p|reel|reels|tv)\/([^/]+)/)?.[1] ?? null;
  if (platform === "tiktok") return new URL(url).pathname.match(/\/video\/(\d+)/)?.[1] ?? null;
  if (platform === "douyin") return new URL(url).pathname.match(/\/video\/(\d+)/)?.[1] ?? null;
  if (platform === "xiaohongshu") return new URL(url).pathname.match(/\/(?:explore|discovery\/item)\/([a-f\d]{24})/i)?.[1] ?? null;
  return null;
}

function extractYouTubeVideoId(url: string) {
  const parsed = new URL(url);
  if (parsed.hostname === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
  if (parsed.pathname === "/watch") return parsed.searchParams.get("v");
  return parsed.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? null;
}

function trackingConnectionMessage(platform: Platform | null) {
  if (platform === Platform.youtube) return "请先在连接设置中配置你自己的 YouTube Data API Key。";
  if (platform === Platform.xiaohongshu || platform === Platform.douyin) {
    return "请先在连接设置中配置你自己的 TikHub API Key。";
  }
  if (platform) return "该平台尚需官方 OAuth 或应用审核；当前可手工补充指标进行复盘。";
  return "普通网页当前支持内容复盘和手工指标。";
}

function fifteenMinuteBucket() {
  return Math.floor(Date.now() / (15 * 60 * 1_000)).toString();
}

function dayBucket(date: Date) {
  return date.toISOString().slice(0, 10);
}

function withoutObservedAt(value: z.infer<typeof manualMetricsSchema>) {
  const metrics = { ...value };
  delete metrics.observedAt;
  return metrics;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function integerValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.round(number) : undefined;
}

function dateValue(value: unknown) {
  const date = typeof value === "string" ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? date : null;
}
