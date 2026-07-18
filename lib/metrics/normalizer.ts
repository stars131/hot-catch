import type { Prisma } from "@prisma/client";

export type NormalizedMetricSnapshot = {
  viewCount?: number;
  likeCount?: number;
  collectCount?: number;
  commentCount?: number;
  shareCount?: number;
  followerDelta?: number;
  rawData: Prisma.InputJsonValue;
};

export function normalizeMetrics(value: unknown): NormalizedMetricSnapshot {
  const root = findMetricsRecord(value);
  return {
    viewCount: numberValue(root, ["viewCount", "views", "playCount", "play_count", "readCount"]),
    likeCount: numberValue(root, ["likeCount", "likes", "diggCount", "digg_count"]),
    collectCount: numberValue(root, ["collectCount", "collects", "favoriteCount"]),
    commentCount: numberValue(root, ["commentCount", "comments"]),
    shareCount: numberValue(root, ["shareCount", "shares", "forwardCount"]),
    followerDelta: numberValue(root, ["followerDelta", "fansDelta"]),
    rawData: JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue,
  };
}

function findMetricsRecord(value: unknown): Record<string, unknown> {
  const root = asRecord(value);
  for (const key of ["data", "metrics", "analytics", "stats", "statistics"]) {
    const nested = asRecord(root[key]);
    if (Object.keys(nested).length) return findMetricsRecord(nested);
  }
  return root;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(root: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = root[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return Math.round(parsed);
    }
  }
}
