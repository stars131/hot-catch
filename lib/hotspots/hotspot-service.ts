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
  | "sspai"
  | "kuaishou"
  | "tieba"
  | "thepaper"
  | "ithome"
  | "netease-news"
  | "qq-news"
  | "36kr"
  | "hupu"
  | "v2ex"
  | "hellogithub"
  | "xiaohongshu"
  | "so360"
  | "sogou"
  | "sina"
  | "douban-movie";

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
  | "少数派"
  | "快手"
  | "贴吧"
  | "澎湃新闻"
  | "IT之家"
  | "网易新闻"
  | "腾讯新闻"
  | "36氪"
  | "虎扑"
  | "V2EX"
  | "HelloGitHub"
  | "小红书"
  | "360搜索"
  | "搜狗"
  | "新浪"
  | "豆瓣电影";

export type HotspotStatus = "爆发中" | "上升" | "回落" | "观望";

export type HotspotProjectReference = {
  repo: string;
  url: string;
  role: "api-backend" | "source-map" | "algorithm" | "monitoring" | "domain-feed";
  notes: string;
  influence: string;
};

export type HotspotSourceDefinition = {
  code: HotspotPlatformCode;
  label: HotspotPlatformLabel;
  category: string;
  apiPath: string;
  requiresCookie: boolean;
  cookieConfigured: boolean;
  cookieEnv?: string;
  upstreamEnv?: string;
  notes?: string;
};

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
  backend: string;
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
  backend: string;
  requiresCookie?: boolean;
  cookieConfigured?: boolean;
  message?: string;
};

export type HotspotSourceApiPayload = {
  generatedAt: string;
  source: HotspotSourceDefinition;
  items: HotspotSourceItem[];
  health: HotspotSourceHealth;
};

export type HotspotPayload = {
  generatedAt: string;
  platforms: Array<"全平台" | HotspotPlatformLabel | "技术圈">;
  topics: HotspotTopic[];
  sourceHealth: HotspotSourceHealth[];
  sourceCatalog: HotspotSourceDefinition[];
  projectReferences: HotspotProjectReference[];
  summary: {
    totalItems: number;
    activeSources: number;
    crossPlatformTopics: number;
    backendCount: number;
    cookieSourceCount: number;
    cookieConfiguredCount: number;
    projectReferenceCount: number;
    source: string;
  };
};

type HotspotSource = {
  code: HotspotPlatformCode;
  label: HotspotPlatformLabel;
  category: string;
  color: string;
  weight: number;
  orzPlatform?: string;
  dailyHotRoute?: string;
  sixtyRoute?: string;
  cookieBackend?: boolean;
  nativeFetcher?: (source: HotspotSource) => Promise<HotspotSourceItem[]>;
};

type CookieBackendConfig = {
  code: HotspotPlatformCode;
  cookieEnv: string;
  upstreamEnv: string;
  defaultUrl?: string;
  method?: "GET" | "POST";
  body?: string;
  notes: string;
};

type GenericHotItem = {
  title?: string;
  name?: string;
  word?: string;
  keyword?: string;
  query?: string;
  url?: string;
  link?: string;
  mobileUrl?: string;
  href?: string;
  desc?: string;
  description?: string;
  content?: string;
  abstract?: string;
  score?: string | number;
  hot?: string | number;
  hot_value?: string | number;
  hotValue?: string | number;
  heat?: string | number;
  views?: string | number;
  view?: string | number;
  interactionNum?: string | number;
  discuss_num?: string | number;
  replies?: string | number;
  rate?: string | number;
};

type GenericHotResponse = {
  status?: string | number;
  code?: string | number;
  msg?: string;
  message?: string;
  data?: unknown;
  result?: unknown;
  news?: unknown;
  list?: unknown;
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
const REQUEST_TIMEOUT_MS = 6500;
const ORZ_DAILY_NEWS_ENDPOINTS = [
  "https://orz.ai/api/v1/dailynews/",
  "https://news.orz.ai/api/v1/dailynews/",
];
const DAILY_HOT_API_BASE = "https://api-hot.imsyy.top";
const SIXTY_SECONDS_BASE = "https://60s.viki.moe/v2";

const COOKIE_BACKENDS: CookieBackendConfig[] = [
  {
    code: "xiaohongshu",
    cookieEnv: "HOTSPOT_XIAOHONGSHU_COOKIE",
    upstreamEnv: "HOTSPOT_XIAOHONGSHU_UPSTREAM",
    defaultUrl: "https://edith.xiaohongshu.com/api/sns/web/v1/search/hot_list",
    notes: "小红书 Web 热搜接口通常需要登录态 Cookie，也可能需要风控签名；可用自建上游聚合接口替代。",
  },
  {
    code: "kuaishou",
    cookieEnv: "HOTSPOT_KUAISHOU_COOKIE",
    upstreamEnv: "HOTSPOT_KUAISHOU_UPSTREAM",
    notes: "快手热榜常走 GraphQL/Web 会话，默认保留 Cookie 与自建上游入口。",
  },
  {
    code: "hupu",
    cookieEnv: "HOTSPOT_HUPU_COOKIE",
    upstreamEnv: "HOTSPOT_HUPU_UPSTREAM",
    notes: "虎扑社区页在部分网络下会触发风控；可配置 Cookie 或自建解析上游。",
  },
  {
    code: "36kr",
    cookieEnv: "HOTSPOT_36KR_COOKIE",
    upstreamEnv: "HOTSPOT_36KR_UPSTREAM",
    defaultUrl: "https://gateway.36kr.com/api/mis/nav/home/nav/rank/hot",
    notes: "36氪网关可能按地域或频率返回异常；保留 Cookie 与聚合上游方案。",
  },
  {
    code: "qq-news",
    cookieEnv: "HOTSPOT_QQ_NEWS_COOKIE",
    upstreamEnv: "HOTSPOT_QQ_NEWS_UPSTREAM",
    defaultUrl: "https://i.news.qq.com/trpc.qqnews_web.kv_srv.kv_srv_http_proxy/list?sub_srv_id=24hours&srv_id=pc&offset=0&limit=30&strategy=1",
    notes: "腾讯新闻热榜接口有时需要会话与频控；可经本地聚合 API 使用。",
  },
  {
    code: "sspai",
    cookieEnv: "HOTSPOT_SSPAI_COOKIE",
    upstreamEnv: "HOTSPOT_SSPAI_UPSTREAM",
    defaultUrl: "https://sspai.com/api/v1/article/tag/page/get?limit=30&offset=0",
    notes: "少数派接口偶发需要客户端态；Cookie 配置后作为后备聚合源。",
  },
  {
    code: "so360",
    cookieEnv: "HOTSPOT_SO360_COOKIE",
    upstreamEnv: "HOTSPOT_SO360_UPSTREAM",
    notes: "360 搜索趋势在部分 TLS/风控场景下不稳定，保留自建上游入口。",
  },
  {
    code: "sogou",
    cookieEnv: "HOTSPOT_SOGOU_COOKIE",
    upstreamEnv: "HOTSPOT_SOGOU_UPSTREAM",
    notes: "搜狗热榜保留 Cookie 和自建上游入口。",
  },
  {
    code: "sina",
    cookieEnv: "HOTSPOT_SINA_COOKIE",
    upstreamEnv: "HOTSPOT_SINA_UPSTREAM",
    notes: "新浪热门页常见编码和访问限制问题，建议通过自建上游归一化。",
  },
];

export const HOTSPOT_PROJECT_REFERENCES: HotspotProjectReference[] = [
  {
    repo: "imsyy/DailyHotApi",
    url: "https://github.com/imsyy/DailyHotApi",
    role: "api-backend",
    notes: "提供大量中文平台 route，适合作为 orz.ai 之外的 API 后备。",
    influence: "接入 DailyHotApi route 命名、通用响应归一化和多平台源表。",
  },
  {
    repo: "vikiboss/60s",
    url: "https://github.com/vikiboss/60s",
    role: "api-backend",
    notes: "公开 60s API，微博、知乎、抖音、百度等接口稳定返回。",
    influence: "接入 60s 公开接口作为强后备通道。",
  },
  {
    repo: "joyce677/TrendRadar",
    url: "https://github.com/joyce677/TrendRadar",
    role: "algorithm",
    notes: "用配置化平台、权重和报告生成组织热点。",
    influence: "保留平台权重、跨平台聚类和选题角度生成。",
  },
  {
    repo: "tophubs/TopList",
    url: "https://github.com/tophubs/TopList",
    role: "source-map",
    notes: "今日热榜的经典多源抓取项目。",
    influence: "扩展平台覆盖，并按平台健康度显示抓取状态。",
  },
  {
    repo: "uxiaohan/HotList-Web",
    url: "https://github.com/uxiaohan/HotList-Web",
    role: "source-map",
    notes: "聚合式热点 Web 项目。",
    influence: "参考热点列表、平台过滤和一屏聚合展示。",
  },
  {
    repo: "LoseNine/TopList-python",
    url: "https://github.com/LoseNine/TopList-python",
    role: "source-map",
    notes: "Python 版热榜聚合实现。",
    influence: "补充多语言项目里的榜单归一化思路。",
  },
  {
    repo: "ieliwb/tophub-api",
    url: "https://github.com/ieliwb/tophub-api",
    role: "api-backend",
    notes: "TopHub API 使用手册与接口整理。",
    influence: "沉淀 route registry，方便继续替换或增加 API 后端。",
  },
  {
    repo: "fancyboi999/daily-hot-mcp",
    url: "https://github.com/fancyboi999/daily-hot-mcp",
    role: "api-backend",
    notes: "MCP 化的 daily-hot 服务，列出 30 多个来源和原生接口。",
    influence: "接入微博、知乎、B站、HN、GitHub 等原生后备抓取。",
  },
  {
    repo: "one-box-u/openclaw-daily-hot-news",
    url: "https://github.com/one-box-u/openclaw-daily-hot-news",
    role: "source-map",
    notes: "OpenClaw 热点技能，覆盖数十个平台。",
    influence: "补充快手、虎扑、V2EX、HelloGitHub 等长尾来源。",
  },
  {
    repo: "BACH-AI-Tools/hot-news-bachstudio",
    url: "https://github.com/BACH-AI-Tools/hot-news-bachstudio",
    role: "api-backend",
    notes: "MCP 热点新闻服务。",
    influence: "参考工具化输出和可解释来源描述。",
  },
  {
    repo: "zbw-zbw/news-aggregator",
    url: "https://github.com/zbw-zbw/news-aggregator",
    role: "domain-feed",
    notes: "技术新闻聚合方向。",
    influence: "强化 GitHub、Hacker News、掘金、V2EX 技术圈过滤。",
  },
  {
    repo: "6551Team/daily-news",
    url: "https://github.com/6551Team/daily-news",
    role: "api-backend",
    notes: "基于 6551 API 的每日资讯/热点项目。",
    influence: "补充每日新闻型数据的兜底思路。",
  },
  {
    repo: "anuj0456/AiLert",
    url: "https://github.com/anuj0456/AiLert",
    role: "domain-feed",
    notes: "AI 内容聚合项目。",
    influence: "在分类推断里增强 AI、模型、Agent、芯片等科技信号。",
  },
  {
    repo: "Harshed-V/Tech_Trend_Monitor",
    url: "https://github.com/Harshed-V/Tech_Trend_Monitor",
    role: "monitoring",
    notes: "GitHub、Dev.to、HN、Reddit 技术趋势监控。",
    influence: "加入技术圈趋势和近期项目热度抓取。",
  },
  {
    repo: "hrnrxb/AI-News-Aggregator-Bot",
    url: "https://github.com/hrnrxb/AI-News-Aggregator-Bot",
    role: "domain-feed",
    notes: "AI/ML/NLP 新闻 Telegram Bot。",
    influence: "把 AI 新闻类热点纳入风险提示和选题角度。",
  },
  {
    repo: "hoodini/yuv-ai-trends",
    url: "https://github.com/hoodini/yuv-ai-trends",
    role: "domain-feed",
    notes: "AI/ML 趋势聚合。",
    influence: "增强技术热点的长尾跟进判断。",
  },
  {
    repo: "JiuNian3219/hot-spot-api-service",
    url: "https://github.com/JiuNian3219/hot-spot-api-service",
    role: "api-backend",
    notes: "Python 后端热点 API 服务。",
    influence: "继续保持 API 与聚类层分离，便于后续换源。",
  },
  {
    repo: "ly364124/hot-news-app",
    url: "https://github.com/ly364124/hot-news-app",
    role: "source-map",
    notes: "知乎、微博实时热点应用。",
    influence: "重点保障微博、知乎两类高频热点源。",
  },
  {
    repo: "wupinshuo/durian-hotlist",
    url: "https://github.com/wupinshuo/durian-hotlist",
    role: "source-map",
    notes: "科技与信息流热榜项目。",
    influence: "补充信息流平台的统一热度计算。",
  },
  {
    repo: "fenglingback/best-dy-hotlist",
    url: "https://github.com/fenglingback/best-dy-hotlist",
    role: "domain-feed",
    notes: "抖音热榜方向项目。",
    influence: "强化抖音 route 和短视频趋势分类。",
  },
];

const SOURCES: HotspotSource[] = [
  { code: "weibo", label: "微博", category: "社交热搜", color: "#ff5d7d", weight: 1.18, orzPlatform: "weibo", dailyHotRoute: "weibo", sixtyRoute: "weibo", nativeFetcher: fetchNativeWeibo },
  { code: "baidu", label: "百度", category: "公共事件", color: "#6ea8ff", weight: 1.08, orzPlatform: "baidu", dailyHotRoute: "baidu", sixtyRoute: "baidu/hot" },
  { code: "zhihu", label: "知乎", category: "深度讨论", color: "#66d6a8", weight: 1.02, orzPlatform: "zhihu", dailyHotRoute: "zhihu", sixtyRoute: "zhihu", nativeFetcher: fetchNativeZhihu },
  { code: "douyin", label: "抖音", category: "短视频趋势", color: "#ff8a3d", weight: 1.08, orzPlatform: "douyin", dailyHotRoute: "douyin", sixtyRoute: "douyin" },
  { code: "bilibili", label: "B站", category: "视频社区", color: "#7bd8ff", weight: 0.96, orzPlatform: "bilibili", dailyHotRoute: "bilibili", sixtyRoute: "bilibili", nativeFetcher: fetchNativeBilibili },
  { code: "jinritoutiao", label: "今日头条", category: "资讯热点", color: "#ff7061", weight: 0.98, orzPlatform: "jinritoutiao", dailyHotRoute: "toutiao", sixtyRoute: "toutiao" },
  { code: "github", label: "GitHub", category: "技术项目", color: "#b7c4d6", weight: 0.9, orzPlatform: "github", dailyHotRoute: "github", nativeFetcher: fetchNativeGitHub },
  { code: "hackernews", label: "Hacker News", category: "技术讨论", color: "#f6a04d", weight: 0.86, orzPlatform: "hackernews", dailyHotRoute: "hackernews", nativeFetcher: fetchNativeHackerNews },
  { code: "juejin", label: "掘金", category: "开发者社区", color: "#6aa8ff", weight: 0.84, orzPlatform: "juejin", dailyHotRoute: "juejin" },
  { code: "sspai", label: "少数派", category: "数字生活", color: "#e46b7c", weight: 0.82, orzPlatform: "sspai", dailyHotRoute: "sspai", cookieBackend: true },
  { code: "kuaishou", label: "快手", category: "短视频趋势", color: "#ffb020", weight: 0.9, dailyHotRoute: "kuaishou", cookieBackend: true },
  { code: "tieba", label: "贴吧", category: "兴趣社区", color: "#5da2ff", weight: 0.82, dailyHotRoute: "tieba", nativeFetcher: fetchNativeTieba },
  { code: "thepaper", label: "澎湃新闻", category: "公共事件", color: "#7cc4ff", weight: 0.9, dailyHotRoute: "thepaper", nativeFetcher: fetchNativeThePaper },
  { code: "ithome", label: "IT之家", category: "科技资讯", color: "#ff6b6b", weight: 0.86, dailyHotRoute: "ithome", nativeFetcher: fetchNativeIthome },
  { code: "netease-news", label: "网易新闻", category: "资讯热点", color: "#dc2626", weight: 0.86, dailyHotRoute: "netease-news", nativeFetcher: fetchNativeNetease },
  { code: "qq-news", label: "腾讯新闻", category: "资讯热点", color: "#4f9bff", weight: 0.84, dailyHotRoute: "qq-news", cookieBackend: true },
  { code: "36kr", label: "36氪", category: "财经商业", color: "#4ade80", weight: 0.84, dailyHotRoute: "36kr", cookieBackend: true },
  { code: "hupu", label: "虎扑", category: "体育社区", color: "#f59e0b", weight: 0.8, dailyHotRoute: "hupu", cookieBackend: true },
  { code: "v2ex", label: "V2EX", category: "开发者社区", color: "#94a3b8", weight: 0.8, dailyHotRoute: "v2ex", nativeFetcher: fetchNativeV2ex },
  { code: "hellogithub", label: "HelloGitHub", category: "技术项目", color: "#22c55e", weight: 0.78, dailyHotRoute: "hellogithub", nativeFetcher: fetchNativeHelloGitHub },
  { code: "xiaohongshu", label: "小红书", category: "生活方式", color: "#ff2d55", weight: 0.92, dailyHotRoute: "xiaohongshu", cookieBackend: true },
  { code: "so360", label: "360搜索", category: "搜索热榜", color: "#60d394", weight: 0.78, dailyHotRoute: "so360", cookieBackend: true },
  { code: "sogou", label: "搜狗", category: "搜索热榜", color: "#f97316", weight: 0.78, dailyHotRoute: "sogou", cookieBackend: true },
  { code: "sina", label: "新浪", category: "资讯热点", color: "#f43f5e", weight: 0.78, dailyHotRoute: "sina", cookieBackend: true },
  { code: "douban-movie", label: "豆瓣电影", category: "文娱内容", color: "#22c55e", weight: 0.74, dailyHotRoute: "douban-movie", nativeFetcher: fetchNativeDoubanMovie },
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
  "新闻",
  "热搜",
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
    const definition = toSourceDefinition(source);
    if (result.status === "fulfilled") {
      const backends = Array.from(new Set(result.value.map((item) => item.backend)));
      sourceHealth.push({
        platform: source.label,
        platformCode: source.code,
        ok: result.value.length > 0,
        count: result.value.length,
        backend: backends.join(" + ") || "无数据",
        requiresCookie: definition.requiresCookie,
        cookieConfigured: definition.cookieConfigured,
        message: result.value.length ? undefined : "接口可访问但没有返回可用条目",
      });
      allItems.push(...result.value);
    } else {
      sourceHealth.push({
        platform: source.label,
        platformCode: source.code,
        ok: false,
        count: 0,
        backend: "全部后备失败",
        requiresCookie: definition.requiresCookie,
        cookieConfigured: definition.cookieConfigured,
        message: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  const topics = buildTopics(allItems).slice(0, params?.limit ?? 36);
  const activeBackends = new Set(allItems.map((item) => item.backend));
  const sourceCatalog = listHotspotSourceDefinitions();
  const payload: HotspotPayload = {
    generatedAt: new Date().toISOString(),
    platforms: [
      "全平台",
      "微博",
      "百度",
      "知乎",
      "抖音",
      "B站",
      "今日头条",
      "小红书",
      "GitHub",
      "Hacker News",
      "技术圈",
    ],
    topics,
    sourceHealth,
    sourceCatalog,
    projectReferences: HOTSPOT_PROJECT_REFERENCES,
    summary: {
      totalItems: allItems.length,
      activeSources: sourceHealth.filter((source) => source.ok).length,
      crossPlatformTopics: topics.filter((topic) => topic.sources.length > 1).length,
      backendCount: activeBackends.size,
      cookieSourceCount: sourceCatalog.filter((source) => source.requiresCookie).length,
      cookieConfiguredCount: sourceCatalog.filter((source) => source.requiresCookie && source.cookieConfigured).length,
      projectReferenceCount: HOTSPOT_PROJECT_REFERENCES.length,
      source: "orz.ai + DailyHotApi + 60s + cookie-backed aggregators + native fetchers + local clustering",
    },
  };

  cachedPayload = { expiresAt: now + HOTSPOT_CACHE_MS, payload };
  return payload;
}

export function listHotspotSourceDefinitions(): HotspotSourceDefinition[] {
  return SOURCES.map(toSourceDefinition);
}

export async function getHotspotSourcePayload(code: string): Promise<HotspotSourceApiPayload> {
  const source = getSourceByCode(code);
  const definition = toSourceDefinition(source);
  try {
    const items = await fetchSourceItems(source);
    const backends = Array.from(new Set(items.map((item) => item.backend)));
    return {
      generatedAt: new Date().toISOString(),
      source: definition,
      items,
      health: {
        platform: source.label,
        platformCode: source.code,
        ok: items.length > 0,
        count: items.length,
        backend: backends.join(" + ") || "无数据",
        requiresCookie: definition.requiresCookie,
        cookieConfigured: definition.cookieConfigured,
        message: items.length ? undefined : "接口可访问但没有返回可用条目",
      },
    };
  } catch (error) {
    return {
      generatedAt: new Date().toISOString(),
      source: definition,
      items: [],
      health: {
        platform: source.label,
        platformCode: source.code,
        ok: false,
        count: 0,
        backend: "全部后备失败",
        requiresCookie: definition.requiresCookie,
        cookieConfigured: definition.cookieConfigured,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function fetchSourceItems(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const attempts: Array<Promise<HotspotSourceItem[]>> = [];

  if (source.orzPlatform) {
    attempts.push(fetchOrzItems(source));
  }
  if (source.dailyHotRoute) {
    attempts.push(fetchDailyHotItems(source));
  }
  if (source.sixtyRoute) {
    attempts.push(fetchSixtySecondItems(source));
  }
  if (source.cookieBackend) {
    attempts.push(fetchCookieBackendItems(source));
  }
  if (source.nativeFetcher) {
    attempts.push(source.nativeFetcher(source));
  }

  const results = await Promise.allSettled(attempts);
  const errors: string[] = [];
  const items: HotspotSourceItem[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      items.push(...result.value);
    } else {
      errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
    }
  }

  const deduped = dedupeItems(items).slice(0, 80);
  if (deduped.length > 0) return deduped;
  throw new Error(errors.slice(0, 3).join(" / ") || `${source.label} fetch failed`);
}

async function fetchOrzItems(source: HotspotSource): Promise<HotspotSourceItem[]> {
  let lastError: unknown;
  for (const endpoint of ORZ_DAILY_NEWS_ENDPOINTS) {
    try {
      const url = new URL(endpoint);
      url.searchParams.set("platform", source.orzPlatform ?? source.code);
      const json = await fetchJson<GenericHotResponse>(url.toString(), "orz.ai");
      return normalizeItems(extractItemArray(json), source, "orz.ai");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${source.label} orz.ai fetch failed`);
}

async function fetchDailyHotItems(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const json = await fetchJson<GenericHotResponse>(`${DAILY_HOT_API_BASE}/${source.dailyHotRoute}`, "DailyHotApi");
  return normalizeItems(extractItemArray(json), source, "DailyHotApi");
}

async function fetchSixtySecondItems(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const json = await fetchJson<GenericHotResponse>(`${SIXTY_SECONDS_BASE}/${source.sixtyRoute}`, "60s");
  return normalizeItems(extractItemArray(json), source, "60s");
}

async function fetchCookieBackendItems(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const config = getCookieBackend(source.code);
  if (!config) {
    throw new Error(`${source.label} 没有 Cookie 聚合配置`);
  }

  const configuredUpstream = process.env[config.upstreamEnv];
  const cookie = process.env[config.cookieEnv];
  if (!configuredUpstream && !cookie) {
    throw new Error(`${source.label} Cookie 聚合待配置：设置 ${config.cookieEnv} 或 ${config.upstreamEnv}`);
  }

  const upstream = configuredUpstream || config.defaultUrl;
  if (!upstream) {
    throw new Error(`${source.label} 需要配置 ${config.upstreamEnv}，或补充默认上游接口`);
  }

  const headers: Record<string, string> = {
    Accept: "application/json,text/plain,*/*",
  };
  if (cookie) {
    headers.Cookie = cookie;
  }

  const json = await fetchJson<GenericHotResponse | unknown[]>(upstream, `Cookie聚合:${source.label}`, {
    method: config.method ?? "GET",
    headers,
    body: config.body,
  });
  return normalizeItems(extractItemArray(json), source, `Cookie聚合:${source.label}`);
}

async function fetchNativeWeibo(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const json = await fetchJson<{ data?: { realtime?: unknown[] } }>("https://weibo.com/ajax/side/hotSearch", "微博原生");
  return normalizeItems(json.data?.realtime ?? [], source, "微博原生");
}

async function fetchNativeZhihu(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const json = await fetchJson<GenericHotResponse>("https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total", "知乎原生");
  return normalizeItems(extractItemArray(json), source, "知乎原生");
}

async function fetchNativeBilibili(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const json = await fetchJson<GenericHotResponse>("https://api.bilibili.com/x/web-interface/popular?ps=30&pn=1", "B站原生");
  return normalizeItems(extractItemArray(json), source, "B站原生");
}

async function fetchNativeHackerNews(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const json = await fetchJson<{ hits?: Array<{ title?: string; url?: string; points?: number; objectID?: string }> }>(
    "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30",
    "HN Algolia",
  );
  const items = (json.hits ?? []).map((item) => ({
    title: item.title,
    url: item.url ?? `https://news.ycombinator.com/item?id=${item.objectID}`,
    score: item.points,
  }));
  return normalizeItems(items, source, "HN Algolia");
}

async function fetchNativeGitHub(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const url = `https://api.github.com/search/repositories?q=created:%3E${since}&sort=stars&order=desc&per_page=30`;
  const json = await fetchJson<{ items?: Array<{ full_name?: string; html_url?: string; stargazers_count?: number; description?: string }> }>(
    url,
    "GitHub Search",
  );
  const items = (json.items ?? []).map((item) => ({
    title: item.full_name,
    url: item.html_url,
    score: item.stargazers_count,
    desc: item.description,
  }));
  return normalizeItems(items, source, "GitHub Search");
}

async function fetchNativeV2ex(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const json = await fetchJson<Array<{ title?: string; url?: string; content?: string; replies?: number }>>(
    "https://www.v2ex.com/api/topics/hot.json",
    "V2EX 原生",
  );
  return normalizeItems(json, source, "V2EX 原生");
}

async function fetchNativeTieba(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const json = await fetchJson<{
    data?: { bang_topic?: { topic_list?: Array<{ topic_name?: string; topic_desc?: string; topic_url?: string; discuss_num?: number }> } };
  }>("https://tieba.baidu.com/hottopic/browse/topicList", "贴吧原生");
  const items = (json.data?.bang_topic?.topic_list ?? []).map((item) => ({
    title: item.topic_name,
    desc: item.topic_desc,
    url: decodeBasicEntities(item.topic_url ?? ""),
    score: item.discuss_num,
  }));
  return normalizeItems(items, source, "贴吧原生");
}

async function fetchNativeThePaper(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const json = await fetchJson<{
    data?: { hotNews?: Array<{ name?: string; link?: string; interactionNum?: number; praiseTimes?: number }> };
  }>("https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar", "澎湃原生");
  const items = (json.data?.hotNews ?? []).map((item) => ({
    title: item.name,
    url: item.link,
    score: item.interactionNum ?? item.praiseTimes,
  }));
  return normalizeItems(items, source, "澎湃原生");
}

async function fetchNativeNetease(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const json = await fetchJson<{
    data?: { list?: Array<{ title?: string; url?: string; source?: string; docid?: string }> };
  }>("https://m.163.com/fe/api/hot/news/flow", "网易原生");
  const items = (json.data?.list ?? []).map((item, index) => ({
    title: item.title,
    url: item.url,
    desc: item.source,
    score: 20000 - index * 550,
  }));
  return normalizeItems(items, source, "网易原生");
}

async function fetchNativeDoubanMovie(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const json = await fetchJson<{
    subjects?: Array<{ title?: string; url?: string; rate?: string; is_new?: boolean }>;
  }>("https://movie.douban.com/j/search_subjects?type=movie&tag=%E7%83%AD%E9%97%A8&page_limit=30&page_start=0", "豆瓣电影原生");
  const items = (json.subjects ?? []).map((item, index) => ({
    title: item.title,
    url: item.url,
    score: Number.parseFloat(item.rate ?? "0") * 1000 + (item.is_new ? 6000 : 0) + Math.max(0, 5000 - index * 120),
    desc: item.rate ? `豆瓣评分 ${item.rate}` : "",
  }));
  return normalizeItems(items, source, "豆瓣电影原生");
}

async function fetchNativeIthome(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const xml = await fetchText("https://www.ithome.com/rss/", "IT之家 RSS");
  return normalizeItems(parseRssItems(xml), source, "IT之家 RSS");
}

async function fetchNativeHelloGitHub(source: HotspotSource): Promise<HotspotSourceItem[]> {
  const xml = await fetchText("https://hellogithub.com/rss", "HelloGitHub RSS");
  return normalizeItems(parseRssItems(xml), source, "HelloGitHub RSS");
}

async function fetchJson<T>(
  url: string,
  label: string,
  init?: {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      signal: controller.signal,
      headers: {
        Accept: "application/json,text/plain,*/*",
        "User-Agent": "hot-catch/1.0 (+https://github.com/stars131/hot-catch)",
        ...init?.headers,
      },
      body: init?.body,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`${label} returned ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${label}: ${error.message}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string, label: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/rss+xml,text/xml,text/plain,*/*",
        "User-Agent": "hot-catch/1.0 (+https://github.com/stars131/hot-catch)",
      },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`${label} returned ${response.status}`);
    }
    return response.text();
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`${label}: ${error.message}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function extractItemArray(response: unknown): unknown[] {
  if (Array.isArray(response)) return response;
  if (!response || typeof response !== "object") return [];
  const record = response as Record<string, unknown>;
  const candidates = [
    record.data,
    record.result,
    record.news,
    record.list,
    record.subjects,
    pickNested(record.data, ["list", "items", "data", "cards", "realtime", "hot", "rank"]),
    pickNested(record.result, ["list", "items", "data", "cards", "realtime", "hot", "rank"]),
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function parseRssItems(xml: string): GenericHotItem[] {
  return Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi))
    .slice(0, 30)
    .map((match, index) => {
      const block = match[1];
      return {
        title: cleanXmlText(readXmlTag(block, "title")),
        url: cleanXmlText(readXmlTag(block, "link")),
        desc: cleanXmlText(readXmlTag(block, "description")).slice(0, 180),
        score: 20000 - index * 550,
      };
    });
}

function readXmlTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] ?? "";
}

function cleanXmlText(text: string) {
  return decodeBasicEntities(text)
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBasicEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function pickNested(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const nested = record[key];
    if (Array.isArray(nested)) return nested;
  }
  return undefined;
}

function normalizeItems(items: unknown[], source: HotspotSource, backend: string): HotspotSourceItem[] {
  return items
    .map((item, index) => normalizeItem(item, source, index, backend))
    .filter((item): item is HotspotSourceItem => Boolean(item));
}

function normalizeItem(
  item: unknown,
  source: HotspotSource,
  index: number,
  backend: string,
): HotspotSourceItem | null {
  if (!item || typeof item !== "object") return null;
  const record = item as GenericHotItem & Record<string, unknown>;
  const target = normalizeNestedTarget(record);
  const title = String(
    target.title ??
      target.name ??
      target.word ??
      target.keyword ??
      target.query ??
      target.desc ??
      target.content ??
      "",
  ).trim();
  if (!title) return null;
  const rawScore = String(
    target.score ??
      target.hot ??
      target.hot_value ??
      target.hotValue ??
      target.heat ??
      target.views ??
      target.view ??
      target.interactionNum ??
      target.discuss_num ??
      target.replies ??
      target.rate ??
      "",
  );
  const score = parseScore(rawScore) || Math.max(1000, 20000 - index * 600);
  return {
    id: `${source.code}-${backend}-${hashText(title)}-${index}`,
    title,
    url: String(target.url ?? target.link ?? target.mobileUrl ?? target.href ?? ""),
    score: Math.round(score * source.weight),
    rawScore,
    desc: String(target.desc ?? target.description ?? target.content ?? target.abstract ?? "").trim(),
    platform: source.label,
    platformCode: source.code,
    rank: index + 1,
    backend,
  };
}

function normalizeNestedTarget(record: GenericHotItem & Record<string, unknown>) {
  const target = { ...record };
  if (record.target && typeof record.target === "object") {
    Object.assign(target, record.target);
  }
  if (record.children && typeof record.children === "object") {
    Object.assign(target, record.children);
  }
  if (record.card && typeof record.card === "object") {
    Object.assign(target, record.card);
  }
  return target as GenericHotItem;
}

function dedupeItems(items: HotspotSourceItem[]) {
  const seen = new Set<string>();
  const deduped: HotspotSourceItem[] = [];
  for (const item of items.sort((a, b) => b.score - a.score)) {
    const key = normalizeTitle(item.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped.map((item, index) => ({ ...item, rank: index + 1 }));
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
  const backendCount = new Set(cluster.items.map((item) => item.backend)).size;
  const scoreBoost = sourceCount > 1 ? 1 + sourceCount * 0.16 : 1 + Math.min(backendCount, 4) * 0.05;
  const heat = clamp(Math.round(logScale(cluster.score * scoreBoost, 1_000, 12_000_000, 42, 99)), 36, 99);
  const change = Math.round((heat - 52) * 1.7 + sourceCount * 11 + backendCount * 4 - Math.min(topItem.rank, 20) * 0.7);
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
    creators: `${sourceCount} 个平台 / ${backendCount} 个后端`,
    related: cluster.keywords.length,
    trend,
    platformShare: buildPlatformShare(cluster.items),
    angles: buildAngles(cluster.title, inferCategory(cluster, topItem.platformCode), heat, status),
    riskNotes: buildRiskNotes(cluster),
    keywords: cluster.keywords.slice(0, 8),
    sources: cluster.items.slice(0, 8),
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
  if (cluster.items.some((item) => ["github", "hackernews", "juejin", "v2ex", "hellogithub"].includes(item.platformCode))) {
    notes.push("技术类热点适合解释应用场景，不要只复述项目名和 star 数。");
  }
  if (cluster.items.some((item) => ["baidu", "qq-news", "netease-news", "thepaper", "sina"].includes(item.platformCode))) {
    notes.push("新闻类热点要区分已确认事实、媒体报道和个人判断。");
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
  if (/ai|模型|openai|github|代码|开发|agent|芯片|机器人|算法|v2ex|hello/i.test(text)) return "科技与AI";
  if (/股|金融|基金|美元|经济|公司|财报|上市|投资|市场|36氪/.test(text)) return "财经商业";
  if (/电影|综艺|明星|剧|演唱会|音乐|游戏|b站|视频|豆瓣/.test(text)) return "文娱内容";
  if (/考试|学校|学生|教育|高考|大学|论文/.test(text)) return "教育成长";
  if (/穿搭|美妆|护肤|旅游|城市|早餐|家居|消费|小红书/.test(text)) return "生活方式";
  if (/足球|篮球|nba|cba|英超|虎扑/i.test(text)) return "体育赛事";
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

function toSourceDefinition(source: HotspotSource): HotspotSourceDefinition {
  const cookieBackend = getCookieBackend(source.code);
  return {
    code: source.code,
    label: source.label,
    category: source.category,
    apiPath: `/api/hotspots/sources/${source.code}`,
    requiresCookie: Boolean(cookieBackend),
    cookieConfigured: cookieBackend ? Boolean(process.env[cookieBackend.cookieEnv] || process.env[cookieBackend.upstreamEnv]) : false,
    cookieEnv: cookieBackend?.cookieEnv,
    upstreamEnv: cookieBackend?.upstreamEnv,
    notes: cookieBackend?.notes,
  };
}

function getCookieBackend(code: HotspotPlatformCode) {
  return COOKIE_BACKENDS.find((backend) => backend.code === code);
}

function getSourceByCode(code: string) {
  const source = SOURCES.find((item) => item.code === code);
  if (!source) {
    throw new Error(`未知热点源：${code}`);
  }
  return source;
}

function getSource(code: HotspotPlatformCode) {
  return SOURCES.find((source) => source.code === code) ?? SOURCES[0];
}

function getSourceByLabel(label: HotspotPlatformLabel) {
  return SOURCES.find((source) => source.label === label) ?? SOURCES[0];
}
