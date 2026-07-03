export type HotspotPlatformCode =
  | "baidu"
  | "weibo"
  | "zhihu"
  | "douyin"
  | "bilibili"
  | "jinritoutiao"
  | "github"
  | "hackernews"
  | "juejin"
  | "sspai";

export type HotspotPlatformLabel =
  | "百度"
  | "微博"
  | "知乎"
  | "抖音"
  | "B站"
  | "今日头条"
  | "GitHub"
  | "Hacker News"
  | "掘金"
  | "少数派";

export type HotspotStatus = "爆发中" | "上升" | "回落" | "观望";

export type HotspotSourceItem = {
  id: string;
  title: string;
  url: string;
  score: number;
  rawScore: string;
  desc: string;
  platform: HotspotPlatformLabel;
  platformCode: HotspotPlatformCode;
  rank: number;
};

export type HotspotTopic = {
  id: string;
  title: string;
  category: string;
  platform: HotspotPlatformLabel;
  heat: number;
  change: number;
  status: HotspotStatus;
  predictedPeak: number;
  peakEta: string;
  notes: number;
  engagement: string;
  creators: string;
  related: number;
  trend: number[];
  platformShare: Array<{ label: HotspotPlatformLabel; value: number; color: string }>;
  angles: Array<{ title: string; description: string; heat: number; status: HotspotStatus }>;
  riskNotes: string[];
  keywords: string[];
  sources: HotspotSourceItem[];
};

export type HotspotSourceHealth = {
  platform: HotspotPlatformLabel;
  platformCode: HotspotPlatformCode;
  ok: boolean;
  count: number;
  message?: string;
};

export type HotspotPayload = {
  generatedAt: string;
  platforms: Array<"全平台" | HotspotPlatformLabel | "技术圈">;
  topics: HotspotTopic[];
  sourceHealth: HotspotSourceHealth[];
  summary: {
    totalItems: number;
    activeSources: number;
    crossPlatformTopics: number;
    source: string;
  };
};

type OrzDailyNewsItem = {
  title?: string;
  url?: string;
  score?: string | number;
  hot?: string | number;
  desc?: string;
  content?: string;
};

type OrzDailyNewsResponse = {
  status?: string | number;
  data?: OrzDailyNewsItem[];
  msg?: string;
};

type HotspotSource = {
  code: HotspotPlatformCode;
  label: HotspotPlatformLabel;
  category: string;
  color: string;
  weight: number;
};

type TopicCluster = {
  id: string;
  title: string;
  category: string;
  score: number;
  keywords: string[];
  items: HotspotSourceItem[];
};

const HOTSPOT_CACHE_MS = 5 * 60 * 1000;
const ORZ_DAILY_NEWS_ENDPOINTS = [
  "https://orz.ai/api/v1/dailynews/",
  "https://news.orz.ai/api/v1/dailynews/",
];

const SOURCES: HotspotSource[] = [
  { code: "weibo", label: "微博", category: "社交热搜", color: "#ff5d7d", weight: 1.18 },
  { code: "baidu", label: "百度", category: "公共事件", color: "#6ea8ff", weight: 1.08 },
  { code: "zhihu", label: "知乎", category: "深度讨论", color: "#66d6a8", weight: 1.02 },
  { code: "douyin", label: "抖音", category: "短视频趋势", color: "#ff8a3d", weight: 1.08 },
  { code: "bilibili", label: "B站", category: "视频社区", color: "#7bd8ff", weight: 0.96 },
  { code: "jinritoutiao", label: "今日头条", category: "资讯热点", color: "#ff7061", weight: 0.98 },
  { code: "github", label: "GitHub", category: "技术项目", color: "#b7c4d6", weight: 0.9 },
  { code: "hackernews", label: "Hacker News", category: "技术讨论", color: "#f6a04d", weight: 0.86 },
  { code: "juejin", label: "掘金", category: "开发者社区", color: "#6aa8ff", weight: 0.84 },
  { code: "sspai", label: "少数派", category: "数字生活", color: "#e46b7c", weight: 0.82 },
];

const STOP_WORDS = new Set([
  "一个",
  "一种",
  "如何",
  "为什么",
  "什么",
  "回应",
  "官方",
  "宣布",
  "最新",
  "热门",
  "视频",
  "网友",
  "中国",
  "美国",
  "今日",
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
]);

let cachedPayload: { expiresAt: number; payload: HotspotPayload } | null = null;

export async function getHotspotPayload(params?: {
  refresh?: boolean;
  limit?: number;
}): Promise<HotspotPayload> {
  const now = Date.now();
  if (!params?.refresh && cachedPayload && cachedPayload.expiresAt > now) {
    return cachedPayload.payload;
  }

  const results = await Promise.allSettled(SOURCES.map(fetchSourceItems));
  const sourceHealth: HotspotSourceHealth[] = [];
  const allItems: HotspotSourceItem[] = [];

  results.forEach((result, index) => {
    const source = SOURCES[index];
    if (result.status === "fulfilled") {
      sourceHealth.push({
        platform: source.label,
        platformCode: source.code,
        ok: true,
        count: result.value.length,
      });
      allItems.push(...result.value);
    } else {
      sourceHealth.push({
        platform: source.label,
        platformCode: source.code,
        ok: false,
        count: 0,
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  const topics = buildTopics(allItems).slice(0, params?.limit ?? 36);
  const payload: HotspotPayload = {
    generatedAt: new Date().toISOString(),
    platforms: ["全平台", "微博", "百度", "知乎", "抖音", "B站", "今日头条", "技术圈"],
    topics,
    sourceHealth,
    summary: {
      totalItems: allItems.length,
      activeSources: sourceHealth.filter((source) => source.ok).length,
      crossPlatformTopics: topics.filter((topic) => topic.sources.length > 1).length,
      source: "orz.ai dailynews + local clustering",
    },
  };

  cachedPayload = { expiresAt: now + HOTSPOT_CACHE_MS, payload };
  return payload;
}

async function fetchSourceItems(source: HotspotSource): Promise<HotspotSourceItem[]> {
  let lastError: unknown;
  for (const endpoint of ORZ_DAILY_NEWS_ENDPOINTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);
    try {
      const url = new URL(endpoint);
      url.searchParams.set("platform", source.code);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`${source.label} returned ${response.status}`);
      }
      const json = (await response.json()) as OrzDailyNewsResponse;
      const data = Array.isArray(json.data) ? json.data : [];
      return data
        .map((item, index) => normalizeOrzItem(item, source, index))
        .filter((item): item is HotspotSourceItem => Boolean(item));
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${source.label} fetch failed`);
}

function normalizeOrzItem(
  item: OrzDailyNewsItem,
  source: HotspotSource,
  index: number,
): HotspotSourceItem | null {
  const title = String(item.title ?? "").trim();
  if (!title) return null;
  const rawScore = String(item.score ?? item.hot ?? "");
  const score = parseScore(rawScore) || Math.max(1000, 20000 - index * 600);
  return {
    id: `${source.code}-${hashText(title)}-${index}`,
    title,
    url: String(item.url ?? ""),
    score: Math.round(score * source.weight),
    rawScore,
    desc: String(item.desc ?? item.content ?? "").trim(),
    platform: source.label,
    platformCode: source.code,
    rank: index + 1,
  };
}

function buildTopics(items: HotspotSourceItem[]): HotspotTopic[] {
  const sortedItems = [...items].sort((a, b) => b.score - a.score);
  const clusters: TopicCluster[] = [];

  for (const item of sortedItems) {
    const keywords = extractKeywords(`${item.title} ${item.desc}`);
    const match = clusters.find((cluster) => areSimilar(cluster, item.title, keywords));
    if (match) {
      match.items.push(item);
      match.score += item.score * (1 + Math.min(keywords.length, 6) * 0.02);
      match.keywords = mergeKeywords(match.keywords, keywords);
      if (item.score > match.items[0].score) {
        match.title = item.title;
      }
    } else {
      clusters.push({
        id: hashText(item.title),
        title: item.title,
        category: getSource(item.platformCode).category,
        score: item.score,
        keywords,
        items: [item],
      });
    }
  }

  return clusters
    .map(clusterToTopic)
    .sort((a, b) => b.heat - a.heat || b.sources.length - a.sources.length);
}

function clusterToTopic(cluster: TopicCluster): HotspotTopic {
  const topItem = [...cluster.items].sort((a, b) => b.score - a.score)[0];
  const sourceCount = new Set(cluster.items.map((item) => item.platformCode)).size;
  const scoreBoost = sourceCount > 1 ? 1 + sourceCount * 0.16 : 1;
  const heat = clamp(Math.round(logScale(cluster.score * scoreBoost, 1_000, 12_000_000, 42, 99)), 36, 99);
  const change = Math.round((heat - 52) * 1.7 + sourceCount * 11 - Math.min(topItem.rank, 20) * 0.7);
  const status = inferStatus(heat, sourceCount, change);
  const trend = buildTrend(heat, change, cluster.id);

  return {
    id: cluster.id,
    title: cluster.title,
    category: inferCategory(cluster, topItem.platformCode),
    platform: topItem.platform,
    heat,
    change,
    status,
    predictedPeak: clamp(Math.round(heat + Math.max(8, sourceCount * 7 + Math.abs(change) * 0.18)), heat, 128),
    peakEta: sourceCount > 1 ? "2-4 小时内继续扩散" : heat > 78 ? "4-8 小时内观察" : "适合长尾跟进",
    notes: cluster.items.length,
    engagement: formatEngagement(cluster.items.reduce((sum, item) => sum + item.score, 0)),
    creators: `${sourceCount} 个来源`,
    related: cluster.keywords.length,
    trend,
    platformShare: buildPlatformShare(cluster.items),
    angles: buildAngles(cluster.title, inferCategory(cluster, topItem.platformCode), heat, status),
    riskNotes: buildRiskNotes(cluster),
    keywords: cluster.keywords.slice(0, 8),
    sources: cluster.items.slice(0, 6),
  };
}

function areSimilar(cluster: TopicCluster, title: string, keywords: string[]) {
  const normalizedTitle = normalizeTitle(title);
  const normalizedClusterTitle = normalizeTitle(cluster.title);
  if (normalizedTitle.includes(normalizedClusterTitle) || normalizedClusterTitle.includes(normalizedTitle)) {
    return Math.min(normalizedTitle.length, normalizedClusterTitle.length) >= 6;
  }

  const titleScore = diceCoefficient(normalizedClusterTitle, normalizedTitle);
  const keywordScore = overlapRatio(cluster.keywords, keywords);
  return titleScore >= 0.46 || keywordScore >= 0.42;
}

function buildAngles(title: string, category: string, heat: number, status: HotspotStatus): HotspotTopic["angles"] {
  return [
    {
      title: "事实梳理 + 时间线",
      description: `把「${title}」拆成发生了什么、为什么现在爆、后续看什么，适合做信息密度高的收藏型图文。`,
      heat: clamp(heat - 3, 42, 99),
      status,
    },
    {
      title: "普通人视角解读",
      description: `从读者最关心的影响切入，少讲宏大判断，多讲和生活、职业、消费或创作有什么关系。`,
      heat: clamp(heat - 8, 38, 92),
      status: heat > 72 ? "上升" : "观望",
    },
    {
      title: `${category}账号可复用结构`,
      description: "保留热点关键词，换成你的垂直经验：开头给判断，中段给证据，结尾给行动建议。",
      heat: clamp(heat - 12, 35, 88),
      status: "观望",
    },
  ];
}

function buildRiskNotes(cluster: TopicCluster) {
  const notes = [
    "外部榜单会持续变化，发布前建议点开原始来源二次确认。",
    "不要把热度估算写成确定事实，避免夸大趋势。",
  ];
  if (cluster.items.some((item) => item.platformCode === "weibo" || item.platformCode === "douyin")) {
    notes.push("娱乐和社交热点容易反转，正文里保留信息来源和时间点。");
  }
  if (cluster.items.some((item) => item.platformCode === "github" || item.platformCode === "hackernews")) {
    notes.push("技术类热点适合解释应用场景，不要只复述项目名和 star 数。");
  }
  return notes.slice(0, 3);
}

function buildPlatformShare(items: HotspotSourceItem[]) {
  const totals = new Map<HotspotPlatformLabel, number>();
  for (const item of items) {
    totals.set(item.platform, (totals.get(item.platform) ?? 0) + item.score);
  }
  const total = Array.from(totals.values()).reduce((sum, score) => sum + score, 0) || 1;
  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label, score]) => ({
      label,
      value: Math.max(1, Math.round((score / total) * 100)),
      color: getSourceByLabel(label).color,
    }));
}

function buildTrend(heat: number, change: number, seed: string) {
  const base = clamp(heat - Math.max(12, Math.abs(change) * 0.36), 22, 86);
  const rng = seededRandom(hashNumber(seed));
  const points: number[] = [];
  for (let index = 0; index < 18; index += 1) {
    const progress = index / 17;
    const drift = change >= 0 ? progress * Math.min(32, Math.abs(change) * 0.42) : -progress * Math.min(20, Math.abs(change) * 0.32);
    const wave = Math.sin(progress * Math.PI * 2.2) * 4 + (rng() - 0.5) * 7;
    points.push(clamp(Math.round(base + drift + wave), 10, 132));
  }
  points[points.length - 1] = heat;
  return points;
}

function extractKeywords(text: string) {
  const cleaned = text
    .toLowerCase()
    .replace(/[^\p{Script=Han}a-z0-9+#.\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.match(/[\p{Script=Han}]{2,}|[a-z0-9+#.]{2,}/gu) ?? [];
  const keywords = new Map<string, number>();
  for (const word of words) {
    if (STOP_WORDS.has(word) || word.length > 20) continue;
    keywords.set(word, (keywords.get(word) ?? 0) + Math.min(word.length, 8));
    if (/[\p{Script=Han}]/u.test(word) && word.length >= 4) {
      for (let index = 0; index <= word.length - 2; index += 1) {
        const token = word.slice(index, index + 2);
        if (!STOP_WORDS.has(token)) keywords.set(token, (keywords.get(token) ?? 0) + 1);
      }
    }
  }
  return Array.from(keywords.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 12);
}

function mergeKeywords(a: string[], b: string[]) {
  return Array.from(new Set([...a, ...b])).slice(0, 14);
}

function inferCategory(cluster: TopicCluster, fallbackCode: HotspotPlatformCode) {
  const text = `${cluster.title} ${cluster.keywords.join(" ")}`;
  if (/ai|模型|openai|github|代码|开发|agent|芯片|机器人|算法/i.test(text)) return "科技与AI";
  if (/股|金融|基金|美元|经济|公司|财报|上市|投资|市场/.test(text)) return "财经商业";
  if (/电影|综艺|明星|剧|演唱会|音乐|游戏|b站|视频/.test(text)) return "文娱内容";
  if (/考试|学校|学生|教育|高考|大学|论文/.test(text)) return "教育成长";
  if (/穿搭|美妆|护肤|旅游|城市|早餐|家居|消费/.test(text)) return "生活方式";
  return getSource(fallbackCode).category;
}

function inferStatus(heat: number, sourceCount: number, change: number): HotspotStatus {
  if (heat >= 88 || sourceCount >= 3) return "爆发中";
  if (change >= 18 || heat >= 68) return "上升";
  if (change < -8) return "回落";
  return "观望";
}

function parseScore(value: string) {
  const normalized = value.replace(/,/g, "").trim().toLowerCase();
  const number = Number.parseFloat(normalized);
  if (!Number.isFinite(number)) return 0;
  if (normalized.includes("亿")) return number * 100_000_000;
  if (normalized.includes("千万")) return number * 10_000_000;
  if (normalized.includes("万") || normalized.includes("w")) return number * 10_000;
  if (normalized.includes("k")) return number * 1000;
  return number;
}

function formatEngagement(value: number) {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}亿`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(1)}w`;
  return value.toLocaleString("zh-CN");
}

function normalizeTitle(text: string) {
  return text.toLowerCase().replace(/[^\p{Script=Han}a-z0-9]/gu, "");
}

function diceCoefficient(a: string, b: string) {
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const grams = new Map<string, number>();
  for (let index = 0; index < a.length - 1; index += 1) {
    const gram = a.slice(index, index + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  let intersection = 0;
  for (let index = 0; index < b.length - 1; index += 1) {
    const gram = b.slice(index, index + 2);
    const count = grams.get(gram) ?? 0;
    if (count > 0) {
      grams.set(gram, count - 1);
      intersection += 1;
    }
  }
  return (2 * intersection) / (a.length + b.length - 2);
}

function overlapRatio(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const set = new Set(a);
  const intersection = b.filter((word) => set.has(word)).length;
  return intersection / Math.min(a.length, b.length);
}

function logScale(value: number, min: number, max: number, outMin: number, outMax: number) {
  const safeValue = clamp(value, min, max);
  const ratio = (Math.log(safeValue) - Math.log(min)) / (Math.log(max) - Math.log(min));
  return outMin + ratio * (outMax - outMin);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashText(text: string) {
  return Math.abs(hashNumber(text)).toString(36);
}

function hashNumber(text: string) {
  let hash = 5381;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 33) ^ text.charCodeAt(index);
  }
  return hash;
}

function seededRandom(seed: number) {
  let value = seed || 1;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

function getSource(code: HotspotPlatformCode) {
  return SOURCES.find((source) => source.code === code) ?? SOURCES[0];
}

function getSourceByLabel(label: HotspotPlatformLabel) {
  return SOURCES.find((source) => source.label === label) ?? SOURCES[0];
}
