import { AppError } from "@/lib/errors";
import type { XDiscoveryInput } from "@/lib/validators/x-discovery";

const X_API_BASE = "https://api.x.com/2";

export const X_REGION_PRESETS = [
  { name: "全球", woeid: 1, publicQuery: null, publicTerms: [] },
  {
    name: "澳大利亚",
    woeid: 23424748,
    publicQuery: "place_country:AU",
    publicTerms: [
      "Australia", "Australian", "澳大利亚", "澳洲", "Sydney", "Melbourne", "Brisbane",
      "Perth", "Adelaide", "Canberra", "Queensland", "New South Wales", "Victoria", "Tasmania",
      "Western Australia", "South Australia", "Northern Territory", "Gold Coast",
    ],
  },
  {
    name: "美国",
    woeid: 23424977,
    publicQuery: "place_country:US",
    publicTerms: [
      "United States", "USA", "America", "American", "美国", "California", "New York", "Texas",
      "Florida", "Washington", "Illinois", "Pennsylvania", "Ohio", "Georgia", "Virginia",
    ],
  },
  {
    name: "英国",
    woeid: 23424975,
    publicQuery: "place_country:GB",
    publicTerms: [
      "United Kingdom", "Britain", "British", "England", "Scotland", "Wales", "Northern Ireland",
      "英国", "London", "Manchester", "Birmingham", "Edinburgh", "Glasgow",
    ],
  },
  {
    name: "日本",
    woeid: 23424856,
    publicQuery: "place_country:JP",
    publicTerms: ["Japan", "Japanese", "日本", "東京", "Tokyo", "Osaka", "大阪", "Kyoto", "京都"],
  },
  {
    name: "纽约",
    woeid: 2459115,
    publicQuery: 'place_country:US "New York"',
    publicTerms: ["New York", "NYC", "纽约"],
  },
  {
    name: "洛杉矶",
    woeid: 2442047,
    publicQuery: 'place_country:US "Los Angeles"',
    publicTerms: ["Los Angeles", "洛杉矶"],
  },
  {
    name: "伦敦",
    woeid: 44418,
    publicQuery: "place_country:GB London",
    publicTerms: ["London", "伦敦"],
  },
  {
    name: "东京",
    woeid: 1118370,
    publicQuery: "place_country:JP (Tokyo OR 東京)",
    publicTerms: ["Tokyo", "東京", "东京"],
  },
] as const;

export type XPublicMetrics = {
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  bookmarks: number;
  impressions: number;
};

export type XAuthor = {
  id: string;
  name: string;
  username: string;
  description: string;
  location: string;
  profileImageUrl: string;
  verified: boolean;
  followers: number;
};

export type XPost = {
  id: string;
  text: string;
  url: string;
  createdAt: string | null;
  language: string | null;
  author: XAuthor | null;
  metrics: XPublicMetrics;
  engagementScore: number;
};

export type XTrend = {
  name: string;
  postCount: number | null;
  url: string;
  rank: number;
  context?: string | null;
};

export type XAccountCollection = {
  account: XAuthor;
  posts: XPost[];
};

export type XRateLimit = {
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
};

export type XDiscoveryPayload = {
  mode: XDiscoveryInput["mode"];
  generatedAt: string;
  source: "X API v2" | "FxTwitter public API";
  dataTier: "official" | "public-osint";
  coverage: string;
  query: string;
  trends: XTrend[];
  posts: XPost[];
  accounts: XAccountCollection[];
  warnings: string[];
  rateLimit: XRateLimit;
};

type XApiError = { title?: string; detail?: string; type?: string; status?: number };
type XApiUser = {
  id?: string;
  name?: string;
  username?: string;
  description?: string;
  location?: string;
  profile_image_url?: string;
  verified?: boolean;
  public_metrics?: { followers_count?: number };
};
type XApiPost = {
  id?: string;
  text?: string;
  author_id?: string;
  created_at?: string;
  lang?: string;
  public_metrics?: {
    like_count?: number;
    reply_count?: number;
    retweet_count?: number;
    quote_count?: number;
    bookmark_count?: number;
    impression_count?: number;
  };
};

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export async function discoverX(
  input: XDiscoveryInput,
  bearerToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<XDiscoveryPayload> {
  const token = bearerToken.trim();
  if (!token) {
    throw new AppError("CREDENTIAL_NOT_CONFIGURED", "X API Bearer Token 未配置。", 422);
  }
  if (input.mode === "region") return discoverRegion(input, token, fetchImpl);
  if (input.mode === "topic") return discoverTopic(input, token, fetchImpl);
  return discoverAccounts(input, token, fetchImpl);
}

async function discoverRegion(
  input: Extract<XDiscoveryInput, { mode: "region" }>,
  token: string,
  fetchImpl: FetchLike,
): Promise<XDiscoveryPayload> {
  const response = await xRequest<{
    data?: Array<{ trend_name?: string; tweet_count?: number | null }>;
    errors?: XApiError[];
  }>(
    `/trends/by/woeid/${input.woeid}?max_trends=${input.maxResults}&trend.fields=trend_name,tweet_count`,
    token,
    fetchImpl,
  );
  const trends = (response.body.data ?? []).flatMap((trend, index) => {
    const name = trend.trend_name?.trim();
    return name
      ? [{
          name,
          postCount: finiteNumberOrNull(trend.tweet_count),
          url: `https://x.com/search?q=${encodeURIComponent(name)}&src=trend_click&f=live`,
          rank: index + 1,
        }]
      : [];
  });
  return payloadBase({
    mode: "region",
    query: `${input.regionName ?? `WOEID ${input.woeid}`} (${input.woeid})`,
    trends,
    warnings: apiWarnings(response.body.errors),
    rateLimit: response.rateLimit,
  });
}

async function discoverTopic(
  input: Extract<XDiscoveryInput, { mode: "topic" }>,
  token: string,
  fetchImpl: FetchLike,
): Promise<XDiscoveryPayload> {
  const query = buildTopicQuery(input.query, input.language);
  const params = postQueryParams(query, input.maxResults);
  const response = await xRequest<{
    data?: XApiPost[];
    includes?: { users?: XApiUser[] };
    errors?: XApiError[];
  }>(`/tweets/search/recent?${params}`, token, fetchImpl);
  const authors = authorMap(response.body.includes?.users ?? []);
  const posts = normalizePosts(response.body.data ?? [], authors)
    .sort((left, right) => right.engagementScore - left.engagementScore);
  return payloadBase({
    mode: "topic",
    query,
    posts,
    warnings: apiWarnings(response.body.errors),
    rateLimit: response.rateLimit,
  });
}

async function discoverAccounts(
  input: Extract<XDiscoveryInput, { mode: "accounts" }>,
  token: string,
  fetchImpl: FetchLike,
): Promise<XDiscoveryPayload> {
  const lookup = new URLSearchParams({
    usernames: input.usernames.join(","),
    "user.fields": "id,name,username,description,location,profile_image_url,verified,public_metrics",
  });
  const usersResponse = await xRequest<{
    data?: XApiUser[];
    errors?: XApiError[];
  }>(`/users/by?${lookup}`, token, fetchImpl);
  const users = (usersResponse.body.data ?? []).map(normalizeAuthor).filter(isPresent);
  const timelineResults = await Promise.allSettled(
    users.map(async (user) => {
      const params = postQueryParams("", input.maxResults);
      params.set("exclude", "retweets,replies");
      params.delete("query");
      const response = await xRequest<{ data?: XApiPost[]; errors?: XApiError[] }>(
        `/users/${user.id}/tweets?${params}`,
        token,
        fetchImpl,
      );
      const posts = normalizePosts(response.body.data ?? [], new Map([[user.id, user]]));
      return { account: user, posts, warnings: apiWarnings(response.body.errors), rateLimit: response.rateLimit };
    }),
  );

  const accounts: XAccountCollection[] = [];
  const warnings = apiWarnings(usersResponse.body.errors);
  let rateLimit = usersResponse.rateLimit;
  for (let index = 0; index < timelineResults.length; index += 1) {
    const result = timelineResults[index];
    if (result.status === "fulfilled") {
      accounts.push({ account: result.value.account, posts: result.value.posts });
      warnings.push(...result.value.warnings);
      rateLimit = tighterRateLimit(rateLimit, result.value.rateLimit);
    } else {
      warnings.push(`@${users[index]?.username ?? "unknown"} 的时间线暂时不可用：${safeErrorMessage(result.reason)}`);
    }
  }
  return payloadBase({
    mode: "accounts",
    query: input.usernames.map((username) => `@${username}`).join(", "),
    accounts,
    posts: accounts.flatMap((account) => account.posts),
    warnings,
    rateLimit,
  });
}

function payloadBase(
  input: Pick<XDiscoveryPayload, "mode" | "query" | "rateLimit"> &
    Partial<Pick<XDiscoveryPayload, "trends" | "posts" | "accounts" | "warnings">>,
): XDiscoveryPayload {
  return {
    mode: input.mode,
    generatedAt: new Date().toISOString(),
    source: "X API v2",
    dataTier: "official",
    coverage: officialCoverage(input.mode),
    query: input.query,
    trends: input.trends ?? [],
    posts: input.posts ?? [],
    accounts: input.accounts ?? [],
    warnings: input.warnings ?? [],
    rateLimit: input.rateLimit,
  };
}

function officialCoverage(mode: XDiscoveryPayload["mode"]) {
  if (mode === "region") return "X 官方 WOEID 趋势结果。";
  if (mode === "topic") return "X 官方近七日公开帖搜索结果。";
  return "X 官方公开账号资料与时间线结果。";
}

function buildTopicQuery(queryValue: string, language?: string) {
  const query = queryValue.trim();
  const languageOperator = language && !/\blang:/i.test(query) ? ` lang:${language}` : "";
  const retweetOperator = /(?:^|\s)-?is:retweet(?:\s|$)/i.test(query) ? "" : " -is:retweet";
  return `(${query})${languageOperator}${retweetOperator}`;
}

function postQueryParams(query: string, maxResults: number) {
  const params = new URLSearchParams({
    max_results: String(maxResults),
    "tweet.fields": "id,text,author_id,created_at,lang,public_metrics",
    expansions: "author_id",
    "user.fields": "id,name,username,description,location,profile_image_url,verified,public_metrics",
  });
  if (query) params.set("query", query);
  return params;
}

function authorMap(users: XApiUser[]) {
  return new Map(
    users.map(normalizeAuthor).filter(isPresent).map((author) => [author.id, author]),
  );
}

function normalizeAuthor(user: XApiUser): XAuthor | null {
  if (!user.id || !user.username) return null;
  return {
    id: user.id,
    name: user.name ?? user.username,
    username: user.username,
    description: user.description ?? "",
    location: user.location ?? "",
    profileImageUrl: user.profile_image_url ?? "",
    verified: Boolean(user.verified),
    followers: safeNumber(user.public_metrics?.followers_count),
  };
}

function normalizePosts(posts: XApiPost[], authors: Map<string, XAuthor>) {
  return posts.flatMap((post): XPost[] => {
    if (!post.id || !post.text) return [];
    const author = post.author_id ? authors.get(post.author_id) ?? null : null;
    const metrics = normalizeMetrics(post.public_metrics);
    return [{
      id: post.id,
      text: post.text,
      url: `https://x.com/${author?.username ?? "i"}/status/${post.id}`,
      createdAt: post.created_at ?? null,
      language: post.lang ?? null,
      author,
      metrics,
      engagementScore: Math.round(
        metrics.likes + metrics.reposts * 2 + metrics.replies * 1.5 + metrics.quotes * 2 + metrics.bookmarks * 0.25,
      ),
    }];
  });
}

function normalizeMetrics(metrics: XApiPost["public_metrics"]): XPublicMetrics {
  return {
    likes: safeNumber(metrics?.like_count),
    replies: safeNumber(metrics?.reply_count),
    reposts: safeNumber(metrics?.retweet_count),
    quotes: safeNumber(metrics?.quote_count),
    bookmarks: safeNumber(metrics?.bookmark_count),
    impressions: safeNumber(metrics?.impression_count),
  };
}

async function xRequest<T extends { errors?: XApiError[] }>(
  path: string,
  token: string,
  fetchImpl: FetchLike,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(`${X_API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await readJson<T>(response);
    const rateLimit = readRateLimit(response.headers);
    if (!response.ok) {
      throw mapXError(response.status, body.errors, rateLimit);
    }
    return { body, rateLimit };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AppError("DEPENDENCY_UNAVAILABLE", "X API 请求超时。", 504);
    }
    throw new AppError("PROVIDER_ERROR", `X API 请求失败：${safeErrorMessage(error)}`, 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function readJson<T>(response: Response) {
  try {
    return (await response.json()) as T;
  } catch {
    return {} as T;
  }
}

function mapXError(status: number, errors: XApiError[] | undefined, rateLimit: XRateLimit) {
  const providerMessage = apiWarnings(errors)[0];
  if (status === 401) {
    return new AppError("CREDENTIAL_INVALID", "X API Bearer Token 无效。", 422);
  }
  if (status === 429) {
    return new AppError("RATE_LIMITED", "X API 请求频率已达上限，请在重置后重试。", 429, { rateLimit });
  }
  if (status === 402 || status === 403) {
    return new AppError("PROVIDER_ERROR", providerMessage || "当前 X API 方案无权访问该检索能力。", status);
  }
  return new AppError("PROVIDER_ERROR", providerMessage || `X API 返回 ${status}。`, 502);
}

function readRateLimit(headers: Headers): XRateLimit {
  const reset = numberHeader(headers.get("x-rate-limit-reset"));
  return {
    limit: numberHeader(headers.get("x-rate-limit-limit")),
    remaining: numberHeader(headers.get("x-rate-limit-remaining")),
    resetAt: reset == null ? null : new Date(reset * 1000).toISOString(),
  };
}

function tighterRateLimit(left: XRateLimit, right: XRateLimit) {
  if (left.remaining == null) return right;
  if (right.remaining == null) return left;
  return right.remaining < left.remaining ? right : left;
}

function apiWarnings(errors?: XApiError[]) {
  return (errors ?? []).map((error) => error.detail || error.title || "X API 返回部分错误。");
}

function numberHeader(value: string | null) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteNumberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知错误";
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
