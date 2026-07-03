import type { NormalizedXhsAccount, NormalizedXhsNote } from "@/lib/xhs/types";

function clampInt(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function clampStr(s: unknown, max = 2000): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t ? t.slice(0, max) : null;
}

export function normalizeAccount(a: NormalizedXhsAccount) {
  return {
    xhsId: clampStr(a.xhsId, 100),
    nickname: clampStr(a.nickname, 100),
    avatarUrl: clampStr(a.avatarUrl, 500),
    profileUrl: clampStr(a.profileUrl, 500),
    description: clampStr(a.description, 2000),
    category: clampStr(a.category, 100),
    followerCount: clampInt(a.followerCount),
    followingCount: clampInt(a.followingCount),
    likedCount: clampInt(a.likedCount),
    noteCount: clampInt(a.noteCount),
  };
}

export function normalizeNote(n: NormalizedXhsNote) {
  return {
    noteId: clampStr(n.noteId, 100),
    title: clampStr(n.title, 300),
    content: clampStr(n.content, 8000),
    noteUrl: clampStr(n.noteUrl, 500),
    coverUrl: clampStr(n.coverUrl, 500),
    tags: Array.isArray(n.tags) ? n.tags.slice(0, 20) : [],
    likeCount: clampInt(n.likeCount),
    collectCount: clampInt(n.collectCount),
    commentCount: clampInt(n.commentCount),
    shareCount: clampInt(n.shareCount),
    publishTime: n.publishedAt ? new Date(n.publishedAt) : null,
  };
}
