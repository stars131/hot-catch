import type {
  NormalizedXhsAccount,
  NormalizedXhsNote,
  XhsDataAdapter,
  XhsFetchResult,
} from "@/lib/xhs/types";
import { hashString } from "@/lib/xhs/adapters/base";

const NICHES = [
  { category: "Study", topics: ["focus", "exam prep", "note taking", "routine"] },
  { category: "Career", topics: ["interview", "resume", "side project", "workflow"] },
  { category: "Lifestyle", topics: ["morning routine", "home", "minimal setup", "habits"] },
  { category: "Growth", topics: ["reflection", "confidence", "planning", "review"] },
  { category: "Creator", topics: ["content calendar", "hooks", "visual style", "community"] },
];

const TITLE_TEMPLATES = [
  "How I made {topic} easier in 7 days",
  "The {topic} checklist I wish I had earlier",
  "A realistic {topic} routine for busy weeks",
  "What actually changed my {topic} results",
  "Before you copy another {topic} method, read this",
];

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length];
}

function buildMockNotes(
  seed: number,
  niche: (typeof NICHES)[number],
  authorNick: string
): NormalizedXhsNote[] {
  return Array.from({ length: 4 }, (_, index) => {
    const topic = pick(niche.topics, seed + index);
    const title = pick(TITLE_TEMPLATES, seed + index * 3).replace("{topic}", topic);
    const likeCount = 300 + ((seed + index * 137) % 9000);
    return {
      noteId: `mock_note_${seed}_${index}`,
      title,
      content: `${authorNick} uses a practical hook, a short story, and a checklist to make ${topic} feel achievable.`,
      noteUrl: `https://www.xiaohongshu.com/explore/mock_${seed}_${index}`,
      tags: [niche.category, topic, "benchmark"],
      likeCount,
      collectCount: Math.floor(likeCount * 0.55),
      commentCount: Math.floor(likeCount * 0.08),
      shareCount: Math.floor(likeCount * 0.04),
    };
  });
}

function buildMockAccount(
  key: string,
  profileUrl?: string,
  xhsId?: string
): NormalizedXhsAccount {
  const seed = hashString(key);
  const niche = pick(NICHES, seed);
  const nickname = `${niche.category} Lab ${String(seed % 100).padStart(2, "0")}`;
  const followerCount = 5000 + (seed % 195000);

  return {
    xhsId: xhsId ?? `mock_${seed}`,
    nickname,
    profileUrl: profileUrl ?? `https://www.xiaohongshu.com/user/profile/mock_${seed}`,
    description: `Shares ${niche.category.toLowerCase()} content around ${niche.topics.slice(0, 3).join(", ")}.`,
    category: niche.category,
    followerCount,
    followingCount: 50 + (seed % 500),
    likedCount: followerCount * 8,
    noteCount: 30 + (seed % 300),
    recentNotes: buildMockNotes(seed, niche, nickname),
  };
}

export const mockAdapter: XhsDataAdapter = {
  name: "mock",

  async fetchAccountById(xhsId: string): Promise<XhsFetchResult> {
    const account = buildMockAccount(xhsId, undefined, xhsId);
    return {
      status: "success",
      account,
      sourceType: "mock",
      dataConfidence: 0.55,
      rawData: { mock: true, input: xhsId },
    };
  },

  async fetchAccountByProfileUrl(url: string): Promise<XhsFetchResult> {
    const account = buildMockAccount(url, url);
    return {
      status: "success",
      account,
      sourceType: "mock",
      dataConfidence: 0.55,
      rawData: { mock: true, input: url },
    };
  },

  async fetchNoteByUrl(url: string): Promise<XhsFetchResult> {
    const seed = hashString(url);
    const niche = pick(NICHES, seed);
    const nickname = `${niche.category} Lab ${String(seed % 100).padStart(2, "0")}`;
    const note = { ...buildMockNotes(seed, niche, nickname)[0], noteUrl: url };
    const account = buildMockAccount(url);
    return {
      status: "success",
      note,
      account,
      sourceType: "mock",
      dataConfidence: 0.55,
      rawData: { mock: true, input: url },
    };
  },
};
