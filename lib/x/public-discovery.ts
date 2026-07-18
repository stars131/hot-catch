import { AppError } from "@/lib/errors";
import type { XDiscoveryInput } from "@/lib/validators/x-discovery";
import {
  X_REGION_PRESETS,
  type XAccountCollection,
  type XAuthor,
  type XDiscoveryPayload,
  type XPost,
  type XPublicMetrics,
  type XRateLimit,
  type XTrend,
} from "@/lib/x/discovery";

const DEFAULT_PUBLIC_API_BASE = "https://api.fxtwitter.com";
const REQUEST_TIMEOUT_MS = 15_000;
const EMPTY_RATE_LIMIT: XRateLimit = { limit: null, remaining: null, resetAt: null };

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type FxProfile = {
  type?: string;
  id?: string;
  name?: string;
  screen_name?: string;
  description?: string;
  location?: string;
  avatar_url?: string | null;
  followers?: number;
  protected?: boolean;
  verification?: { verified?: boolean };
};

type FxStatus = {
  type?: string;
  id?: string;
  url?: string;
  text?: string;
  created_at?: string;
  created_timestamp?: number;
  lang?: string;
  author?: FxProfile;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
  bookmarks?: number;
  views?: number | null;
};

type FxResponseBase = { code?: number; message?: string };
type FxSearchResponse = FxResponseBase & { results?: FxStatus[] };
type FxProfileResponse = FxResponseBase & { user?: FxProfile };
type FxTrendResponse = FxResponseBase & {
  trends?: Array<{
    name?: string;
    rank?: string | null;
    context?: string | null;
    grouped_topics?: Array<{ name?: string }>;
  }>;
};

export async function discoverXPublic(
  input: XDiscoveryInput,
  fetchImpl: FetchLike = fetch,
): Promise<XDiscoveryPayload> {
  if (input.mode === "region") return discoverPublicRegion(input, fetchImpl);
  if (input.mode === "topic") return discoverPublicTopic(input, fetchImpl);
  return discoverPublicAccounts(input, fetchImpl);
}

async function discoverPublicRegion(
  input: Extract<XDiscoveryInput, { mode: "region" }>,
  fetchImpl: FetchLike,
) {
  const preset = X_REGION_PRESETS.find((region) => region.woeid === input.woeid);
  const regionQuery = input.regionQuery?.trim() || preset?.publicQuery || null;

  if (!regionQuery && input.woeid === 1) {
    const response = await publicRequest<FxTrendResponse>(
      `/2/trends?type=trending&count=${input.maxResults}`,
      fetchImpl,
    );
    const trends = normalizeTrends(response.body.trends ?? []).slice(0, input.maxResults);
    return publicPayload({
      mode: "region",
      query: input.regionName ?? "全球",
      trends,
      coverage: "公开趋势流；上游不提供地区切换和公开帖量。",
      warnings: trends.length ? [] : ["公开趋势流本次返回为空，可稍后重试或改用地区关键词检索。"],
      rateLimit: response.rateLimit,
    });
  }

  if (!regionQuery) {
    throw new AppError(
      "VALIDATION_ERROR",
      "公开 OSINT 模式无法识别该 WOEID，请填写地区名称或地区查询条件。",
      400,
    );
  }

  const params = new URLSearchParams({
    q: regionQuery,
    feed: "top",
    count: String(Math.min(100, input.maxResults * 3)),
  });
  const response = await publicRequest<FxSearchResponse>(`/2/search?${params}`, fetchImpl);
  const candidates = normalizeFxPosts(response.body.results ?? []);
  const regionTerms = preset?.publicTerms.length
    ? [...preset.publicTerms]
    : customRegionTerms(input.regionName, regionQuery);
  const posts = candidates
    .filter((post) => regionTerms.length === 0 || matchesRegionEvidence(post, regionTerms))
    .sort((left, right) => right.engagementScore - left.engagementScore)
    .slice(0, input.maxResults);
  const warnings = candidates.length > 0 && posts.length === 0
    ? ["公开搜索返回了候选帖，但没有帖子通过正文或作者公开位置的地区复核，因此未展示未经验证的结果。"]
    : [];
  return publicPayload({
    mode: "region",
    query: `${input.regionName ?? `WOEID ${input.woeid}`} · ${regionQuery}`,
    posts,
    coverage: regionQuery.startsWith("place_country:")
      ? "先使用国家/地区搜索条件，再以帖子正文或作者公开位置进行本地复核；城市预设还会匹配城市名称。"
      : "按自定义地区关键词或 X 搜索操作符筛选，并以正文或作者公开位置复核；不等同于完整 WOEID 趋势榜。",
    warnings,
    rateLimit: response.rateLimit,
  });
}

async function discoverPublicTopic(
  input: Extract<XDiscoveryInput, { mode: "topic" }>,
  fetchImpl: FetchLike,
) {
  const query = buildPublicTopicQuery(input.query, input.language);
  const params = new URLSearchParams({
    q: query,
    feed: "top",
    count: String(input.maxResults),
  });
  const response = await publicRequest<FxSearchResponse>(`/2/search?${params}`, fetchImpl);
  const posts = normalizeFxPosts(response.body.results ?? [])
    .sort((left, right) => right.engagementScore - left.engagementScore)
    .slice(0, input.maxResults);
  return publicPayload({
    mode: "topic",
    query,
    posts,
    coverage: "FxTwitter 公开搜索的热门结果；仅覆盖公开可见内容，排序会随 X 上游变化。",
    rateLimit: response.rateLimit,
  });
}

async function discoverPublicAccounts(
  input: Extract<XDiscoveryInput, { mode: "accounts" }>,
  fetchImpl: FetchLike,
) {
  const results = await Promise.allSettled(
    input.usernames.map((username) => fetchPublicAccount(username, input.maxResults, fetchImpl)),
  );
  const accounts: XAccountCollection[] = [];
  const warnings: string[] = [];
  let rateLimit = EMPTY_RATE_LIMIT;

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    const username = input.usernames[index];
    if (result.status === "fulfilled") {
      accounts.push(result.value.account);
      warnings.push(...result.value.warnings);
      rateLimit = tighterRateLimit(rateLimit, result.value.rateLimit);
    } else {
      warnings.push(`@${username} 的公开资料暂时不可用：${safeErrorMessage(result.reason)}`);
    }
  }

  return publicPayload({
    mode: "accounts",
    query: input.usernames.map((username) => `@${username}`).join(", "),
    accounts,
    posts: accounts.flatMap((account) => account.posts),
    warnings,
    coverage: "FxTwitter 公开账号资料与时间线；私密、受限、已删除或上游未返回的内容不会被收集。",
    rateLimit,
  });
}

async function fetchPublicAccount(username: string, maxResults: number, fetchImpl: FetchLike) {
  const encodedUsername = encodeURIComponent(username);
  const [profileResult, timelineResult] = await Promise.allSettled([
    publicRequest<FxProfileResponse>(`/2/profile/${encodedUsername}?about_account=1`, fetchImpl),
    publicRequest<FxSearchResponse>(
      `/2/profile/${encodedUsername}/statuses?count=${maxResults}`,
      fetchImpl,
      true,
    ),
  ]);
  const timelinePosts = timelineResult.status === "fulfilled"
    ? normalizeFxPosts(timelineResult.value.body.results ?? []).slice(0, maxResults)
    : [];
  const profile = profileResult.status === "fulfilled"
    ? normalizeFxAuthor(profileResult.value.body.user)
    : timelinePosts[0]?.author ?? null;

  if (!profile) {
    throw profileResult.status === "rejected"
      ? profileResult.reason
      : new AppError("NOT_FOUND", `未找到 @${username} 的公开资料。`, 404);
  }

  const warnings: string[] = [];
  if (timelineResult.status === "rejected") {
    warnings.push(`@${username} 的时间线暂时不可用：${safeErrorMessage(timelineResult.reason)}`);
  } else if (profileResult.status === "fulfilled" && profileResult.value.body.user?.protected) {
    warnings.push(`@${username} 是受保护账号，仅保留公开资料。`);
  }
  const rateLimit = tighterRateLimit(
    profileResult.status === "fulfilled" ? profileResult.value.rateLimit : EMPTY_RATE_LIMIT,
    timelineResult.status === "fulfilled" ? timelineResult.value.rateLimit : EMPTY_RATE_LIMIT,
  );
  return { account: { account: profile, posts: timelinePosts }, warnings, rateLimit };
}

function normalizeTrends(trends: NonNullable<FxTrendResponse["trends"]>): XTrend[] {
  return trends.flatMap((trend, index) => {
    const name = trend.name?.trim();
    if (!name) return [];
    const parsedRank = Number.parseInt(trend.rank ?? "", 10);
    const grouped = (trend.grouped_topics ?? []).map((topic) => topic.name?.trim()).filter(Boolean);
    return [{
      name,
      postCount: null,
      url: `https://x.com/search?q=${encodeURIComponent(name)}&src=trend_click&f=live`,
      rank: Number.isFinite(parsedRank) && parsedRank > 0 ? parsedRank : index + 1,
      context: trend.context || grouped.join("、") || null,
    }];
  });
}

function normalizeFxPosts(posts: FxStatus[]): XPost[] {
  return posts.flatMap((post): XPost[] => {
    if (post.type && post.type !== "status") return [];
    if (!post.id || !post.text?.trim()) return [];
    const author = normalizeFxAuthor(post.author);
    const metrics = normalizeFxMetrics(post);
    return [{
      id: post.id,
      text: post.text.trim(),
      url: `https://x.com/${author?.username ?? "i"}/status/${post.id}`,
      createdAt: normalizeCreatedAt(post.created_at, post.created_timestamp),
      language: post.lang ?? null,
      author,
      metrics,
      engagementScore: engagementScore(metrics),
    }];
  });
}

function normalizeFxAuthor(profile?: FxProfile): XAuthor | null {
  if (!profile?.id || !profile.screen_name) return null;
  return {
    id: profile.id,
    name: profile.name?.trim() || profile.screen_name,
    username: profile.screen_name,
    description: profile.description ?? "",
    location: profile.location ?? "",
    profileImageUrl: profile.avatar_url ?? "",
    verified: Boolean(profile.verification?.verified),
    followers: safeNumber(profile.followers),
  };
}

function normalizeFxMetrics(post: FxStatus): XPublicMetrics {
  return {
    likes: safeNumber(post.likes),
    replies: safeNumber(post.replies),
    reposts: safeNumber(post.reposts),
    quotes: safeNumber(post.quotes),
    bookmarks: safeNumber(post.bookmarks),
    impressions: safeNumber(post.views),
  };
}

function engagementScore(metrics: XPublicMetrics) {
  return Math.round(
    metrics.likes +
      metrics.reposts * 2 +
      metrics.replies * 1.5 +
      metrics.quotes * 2 +
      metrics.bookmarks * 0.25,
  );
}

function customRegionTerms(regionName: string | undefined, regionQuery: string) {
  const countryCode = regionQuery.match(/\bplace_country:([A-Z]{2})\b/i)?.[1]?.toUpperCase();
  const countryTerms: Record<string, string[]> = {
    AU: ["Australia", "Australian", "澳大利亚", "澳洲"],
    US: ["United States", "USA", "America", "American", "美国"],
    GB: ["United Kingdom", "Britain", "British", "英国"],
    JP: ["Japan", "Japanese", "日本"],
  };
  if (countryCode && countryTerms[countryCode]) return countryTerms[countryCode];
  const name = regionName?.trim();
  return name && !/\b(?:place|point_radius|place_country|near|within):/i.test(name) ? [name] : [];
}

function matchesRegionEvidence(post: XPost, terms: readonly string[]) {
  const evidence = `${post.author?.location ?? ""}\n${post.text}`;
  return terms.some((term) => includesRegionTerm(evidence, term));
}

function includesRegionTerm(value: string, term: string) {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) return false;
  if (/^[a-z]{1,3}$/i.test(normalizedTerm)) {
    return new RegExp(`(^|[^a-z])${escapeRegExp(normalizedTerm)}([^a-z]|$)`, "i").test(value);
  }
  return value.toLocaleLowerCase().includes(normalizedTerm.toLocaleLowerCase());
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildPublicTopicQuery(queryValue: string, language?: string) {
  const query = queryValue.trim();
  const languageOperator = language && !/\blang:/i.test(query) ? ` lang:${language}` : "";
  const retweetOperator = /(?:^|\s)-?is:retweet(?:\s|$)/i.test(query) ? "" : " -is:retweet";
  return `(${query})${languageOperator}${retweetOperator}`;
}

function publicPayload(
  input: Pick<XDiscoveryPayload, "mode" | "query" | "coverage" | "rateLimit"> &
    Partial<Pick<XDiscoveryPayload, "trends" | "posts" | "accounts" | "warnings">>,
): XDiscoveryPayload {
  return {
    mode: input.mode,
    generatedAt: new Date().toISOString(),
    source: "FxTwitter public API",
    dataTier: "public-osint",
    coverage: input.coverage,
    query: input.query,
    trends: input.trends ?? [],
    posts: input.posts ?? [],
    accounts: input.accounts ?? [],
    warnings: input.warnings ?? [],
    rateLimit: input.rateLimit,
  };
}

async function publicRequest<T extends FxResponseBase>(
  path: string,
  fetchImpl: FetchLike,
  allowNoContent = false,
) {
  try {
    return await publicRequestOnce<T>(path, fetchImpl, allowNoContent);
  } catch (error) {
    if (!isRetryablePublicError(error)) throw error;
    return publicRequestOnce<T>(path, fetchImpl, allowNoContent);
  }
}

async function publicRequestOnce<T extends FxResponseBase>(
  path: string,
  fetchImpl: FetchLike,
  allowNoContent: boolean,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${publicApiBase()}${path}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "min-xingji-public-osint/0.1",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    const rateLimit = readPublicRateLimit(response.headers);
    if (response.status === 204 && allowNoContent) {
      return { body: {} as T, rateLimit };
    }
    const body = await readJson<T>(response);
    const bodyCode = typeof body.code === "number" ? body.code : response.status;
    if (!response.ok || bodyCode >= 400) {
      throw mapPublicError(bodyCode, body.message, rateLimit);
    }
    return { body, rateLimit };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("DEPENDENCY_UNAVAILABLE", "公开 X 数据源请求超时。", 504);
    }
    throw new AppError(
      "DEPENDENCY_UNAVAILABLE",
      `公开 X 数据源请求失败：${safeErrorMessage(error)}`,
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryablePublicError(error: unknown) {
  return error instanceof AppError && error.code === "DEPENDENCY_UNAVAILABLE";
}

function publicApiBase() {
  const configured = process.env.X_PUBLIC_API_BASE?.trim() || DEFAULT_PUBLIC_API_BASE;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("unsupported protocol");
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new AppError("VALIDATION_ERROR", "X_PUBLIC_API_BASE 不是有效的 HTTP(S) 地址。", 500);
  }
}

function mapPublicError(status: number, message: string | undefined, rateLimit: XRateLimit) {
  const safeMessage = message?.trim();
  if (status === 404) {
    return new AppError("NOT_FOUND", safeMessage || "公开 X 数据未找到。", 404);
  }
  if (status === 429) {
    return new AppError("RATE_LIMITED", "公开 X 数据源已限速，请稍后重试。", 429, { rateLimit });
  }
  if (status >= 500) {
    return new AppError("DEPENDENCY_UNAVAILABLE", safeMessage || "公开 X 数据源暂时不可用。", 502);
  }
  return new AppError("PROVIDER_ERROR", safeMessage || `公开 X 数据源返回 ${status}。`, 502);
}

function readPublicRateLimit(headers: Headers): XRateLimit {
  const limit = firstNumberHeader(headers, ["x-rate-limit-limit", "x-ratelimit-limit", "ratelimit-limit"]);
  const remaining = firstNumberHeader(headers, [
    "x-rate-limit-remaining",
    "x-ratelimit-remaining",
    "ratelimit-remaining",
  ]);
  const reset = firstNumberHeader(headers, ["x-rate-limit-reset", "x-ratelimit-reset", "ratelimit-reset"]);
  const resetAt = normalizeRateLimitReset(reset);
  return { limit, remaining, resetAt };
}

function normalizeRateLimitReset(value: number | null) {
  if (value == null) return null;
  const timestamp = value >= 1_000_000_000_000
    ? value
    : value >= 1_000_000_000
      ? value * 1000
      : Date.now() + Math.max(0, value) * 1000;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function firstNumberHeader(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = headers.get(name);
    if (value == null) continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function tighterRateLimit(left: XRateLimit, right: XRateLimit) {
  if (left.remaining == null) return right;
  if (right.remaining == null) return left;
  return right.remaining < left.remaining ? right : left;
}

function normalizeCreatedAt(value?: string, timestamp?: number) {
  const date = value ? new Date(value) : Number.isFinite(timestamp) ? new Date((timestamp ?? 0) * 1000) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function readJson<T>(response: Response) {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}
