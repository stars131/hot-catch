import type {
  SocialAccount,
  SocialContent,
  SocialMetrics,
} from "@/lib/providers/types";
import type { Platform } from "@prisma/client";

type UnknownRecord = Record<string, unknown>;

export function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function pick(root: UnknownRecord, keys: string[]): unknown {
  for (const key of keys) {
    const value = root[key];
    if (value !== undefined && value !== null) return value;
  }
}

export function pickString(root: UnknownRecord, keys: string[]): string | undefined {
  const value = pick(root, keys);
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number") return String(value);
}

export function pickNumber(root: UnknownRecord, keys: string[]): number | undefined {
  const value = pick(root, keys);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number(value.replace(/,/g, ""));
    if (Number.isFinite(normalized)) return normalized;
  }
}

export function dataRecord(response: unknown): UnknownRecord {
  const root = asRecord(response) ?? {};
  return asRecord(root.data) ?? root;
}

function nestedRecord(root: UnknownRecord, keys: string[]): UnknownRecord {
  for (const key of keys) {
    const value = asRecord(root[key]);
    if (value) return value;
  }
  return root;
}

function firstUrl(value: unknown): string | undefined {
  if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = firstUrl(item);
      if (url) return url;
    }
  }
  const record = asRecord(value);
  if (record) {
    return firstUrl(record.url_list ?? record.urlList ?? record.url ?? record.uri);
  }
}

export function normalizeAccount(
  platform: Platform,
  response: unknown,
  fallbackId?: string,
  profileUrl?: string,
): SocialAccount {
  const data = dataRecord(response);
  const root = nestedRecord(data, ["user", "user_info", "userInfo", "author"]);
  const platformAccountId =
    pickString(root, ["user_id", "userId", "sec_uid", "sec_user_id", "id", "uid"]) ??
    fallbackId;
  if (!platformAccountId) throw new Error("Provider response has no account id");

  return {
    platform,
    platformAccountId,
    nickname: pickString(root, ["nickname", "nick_name", "name"]),
    avatarUrl: firstUrl(root.avatar ?? root.avatar_url ?? root.images),
    profileUrl,
    description: pickString(root, ["desc", "description", "signature", "bio"]),
    followerCount: pickNumber(root, ["fans", "follower_count", "fans_count"]),
    followingCount: pickNumber(root, ["follows", "following_count"]),
    likedCount: pickNumber(root, ["interaction", "total_favorited", "liked_count"]),
    contentCount: pickNumber(root, ["notes", "aweme_count", "note_count"]),
    raw: response,
  };
}

export function normalizeMetrics(root: UnknownRecord): SocialMetrics {
  const statistics = nestedRecord(root, ["statistics", "interact_info", "metrics"]);
  return {
    views: pickNumber(statistics, ["play_count", "view_count", "views"]),
    likes: pickNumber(statistics, ["digg_count", "liked_count", "like_count", "likes"]),
    collects: pickNumber(statistics, ["collect_count", "collected_count", "collects"]),
    comments: pickNumber(statistics, ["comment_count", "comments"]),
    shares: pickNumber(statistics, ["share_count", "shares"]),
  };
}

export function normalizeContent(
  platform: Platform,
  value: unknown,
  fallbackId?: string,
  sourceUrl?: string,
): SocialContent {
  const data = dataRecord(value);
  const root = nestedRecord(data, ["aweme_detail", "note", "item", "post"]);
  const author = nestedRecord(root, ["author", "user", "user_info"]);
  const platformContentId =
    pickString(root, ["aweme_id", "note_id", "item_id", "id"]) ?? fallbackId;
  if (!platformContentId) throw new Error("Provider response has no content id");
  const timestamp = pickNumber(root, ["create_time", "time", "publish_time"]);
  const durationMs = pickNumber(root, ["duration"]);
  const video = asRecord(root.video_info) ?? asRecord(root.video);

  return {
    platform,
    platformContentId,
    platformAccountId: pickString(author, [
      "user_id",
      "userId",
      "sec_uid",
      "sec_user_id",
      "uid",
    ]),
    sourceUrl,
    title: pickString(root, ["title", "desc"]),
    body: pickString(root, ["desc", "content", "note_text"]),
    contentType: pickString(root, ["type", "note_type", "aweme_type"]),
    coverUrl: firstUrl(root.cover ?? root.cover_url ?? video?.cover),
    mediaUrl: firstUrl(
      video?.play_addr ?? video?.download_addr ?? root.video_url ?? root.media_url,
    ),
    durationSec: durationMs
      ? durationMs > 1000
        ? Math.round(durationMs / 1000)
        : Math.round(durationMs)
      : undefined,
    publishedAt: timestamp
      ? new Date(timestamp > 10_000_000_000 ? timestamp : timestamp * 1000)
      : undefined,
    metrics: normalizeMetrics(root),
    raw: value,
  };
}

export function extractContentList(response: unknown): unknown[] {
  const data = dataRecord(response);
  for (const key of ["aweme_list", "notes", "items", "list", "data"]) {
    if (Array.isArray(data[key])) return data[key] as unknown[];
  }
  return [];
}

export function extractCursor(response: unknown) {
  const data = dataRecord(response);
  return {
    nextCursor: pickString(data, ["max_cursor", "cursor", "next_cursor"]),
    hasMore: Boolean(data.has_more ?? data.hasMore),
  };
}
