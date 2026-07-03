"use client";

import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bookmark,
  ChevronRight,
  Flame,
  Gauge,
  LineChart,
  Radar,
  RefreshCw,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type HotspotPlatform =
  | "全平台"
  | "小红书"
  | "微博"
  | "百度"
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
  | "360搜索"
  | "搜狗"
  | "新浪"
  | "豆瓣电影"
  | "技术圈";
export type HotspotWindow = "1小时" | "24小时" | "7天";
export type HotspotStatus = "爆发中" | "上升" | "回落" | "观望";

export type HotspotProjectReference = {
  repo: string;
  url: string;
  role: "api-backend" | "source-map" | "algorithm" | "monitoring" | "domain-feed";
  notes: string;
  influence: string;
};

export type HotspotSourceItem = {
  id: string;
  title: string;
  url: string;
  score: number;
  rawScore: string;
  desc: string;
  platform: Exclude<HotspotPlatform, "全平台" | "技术圈">;
  platformCode: string;
  rank: number;
  backend?: string;
};

export type HotspotSourceHealth = {
  platform: Exclude<HotspotPlatform, "全平台" | "技术圈">;
  platformCode: string;
  ok: boolean;
  count: number;
  backend?: string;
  message?: string;
};

export type HotspotTopic = {
  id: string;
  title: string;
  category: string;
  platform: Exclude<HotspotPlatform, "全平台" | "技术圈">;
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
  platformShare: Array<{ label: Exclude<HotspotPlatform, "全平台" | "技术圈">; value: number; color: string }>;
  angles: Array<{ title: string; description: string; heat: number; status: HotspotStatus }>;
  riskNotes: string[];
  keywords?: string[];
  sources?: HotspotSourceItem[];
};

export const hotspotPlatforms: HotspotPlatform[] = ["全平台", "微博", "百度", "知乎", "抖音", "B站", "技术圈"];
export const hotspotWindows: HotspotWindow[] = ["1小时", "24小时", "7天"];

export const hotspotTopics: HotspotTopic[] = [
  {
    id: "dopamine-outfit",
    title: "多巴胺穿搭",
    category: "时尚穿搭",
    platform: "小红书",
    heat: 98.6,
    change: 186,
    status: "爆发中",
    predictedPeak: 125,
    peakEta: "3-5 小时后",
    notes: 12800,
    engagement: "236.5w",
    creators: "6,784",
    related: 312,
    trend: [26, 31, 36, 44, 52, 58, 66, 74, 80, 88, 98, 102, 116, 136, 141, 138, 126, 104],
    platformShare: [
      { label: "小红书", value: 58, color: "#ff2bd6" },
      { label: "抖音", value: 28, color: "#12f7ff" },
      { label: "B站", value: 14, color: "#b6ff3b" },
    ],
    angles: [
      {
        title: "多巴胺色彩穿搭公式",
        description: "结合色彩心理学，拆解不同场景的配色方案，提供可直接抄作业的公式。",
        heat: 92,
        status: "爆发中",
      },
      {
        title: "平价单品穿出多巴胺感",
        description: "从平价品牌和二手控预算出发，强调高性价比单品和复用搭配。",
        heat: 78,
        status: "上升",
      },
      {
        title: "多巴胺穿搭的生活方式",
        description: "延伸到居家、通勤和拍照场景，适合做成系列内容。",
        heat: 65,
        status: "上升",
      },
    ],
    riskNotes: ["内容同质化偏高，标题要避免模板化", "配色审美差异较大，建议保留安全版本", "注意避免过度消费焦虑表达"],
  },
  {
    id: "citywalk",
    title: "CityWalk 路线推荐",
    category: "出行攻略",
    platform: "抖音",
    heat: 91.2,
    change: 126,
    status: "上升",
    predictedPeak: 110,
    peakEta: "今晚 20:00",
    notes: 8700,
    engagement: "181.2w",
    creators: "4,103",
    related: 228,
    trend: [18, 21, 28, 36, 38, 44, 51, 63, 70, 72, 81, 86, 93, 99, 106, 112, 116, 121],
    platformShare: [
      { label: "小红书", value: 45, color: "#ff2bd6" },
      { label: "抖音", value: 41, color: "#12f7ff" },
      { label: "B站", value: 14, color: "#b6ff3b" },
    ],
    angles: [
      {
        title: "半日路线 + 拍照点位",
        description: "把路线、停留时长和照片样张做成清单，适合收藏型内容。",
        heat: 84,
        status: "上升",
      },
      {
        title: "下班后也能走的路线",
        description: "强调低体力、低预算、适合工作日的城市散步。",
        heat: 71,
        status: "上升",
      },
      {
        title: "避开人流的替代路线",
        description: "用冷门街区替代热门商圈，提升内容差异化。",
        heat: 66,
        status: "观望",
      },
    ],
    riskNotes: ["路线信息需要保持准确", "地点推荐容易受天气和营业时间影响", "避免使用未经授权的店铺素材"],
  },
  {
    id: "commute-breakfast",
    title: "早八人通勤早餐",
    category: "美食",
    platform: "小红书",
    heat: 88.7,
    change: 98,
    status: "上升",
    predictedPeak: 104,
    peakEta: "明早 08:20",
    notes: 7600,
    engagement: "154.8w",
    creators: "3,442",
    related: 186,
    trend: [22, 24, 29, 33, 36, 42, 51, 55, 64, 70, 76, 82, 91, 95, 101, 105, 109, 118],
    platformShare: [
      { label: "小红书", value: 62, color: "#ff2bd6" },
      { label: "抖音", value: 24, color: "#12f7ff" },
      { label: "B站", value: 14, color: "#b6ff3b" },
    ],
    angles: [
      {
        title: "10 分钟便利店早餐搭配",
        description: "以价格、蛋白质、饱腹感做对比，直接给出购买组合。",
        heat: 81,
        status: "上升",
      },
      {
        title: "宿舍党无火早餐",
        description: "锁定学生用户，用无需开火和可提前准备做差异化。",
        heat: 69,
        status: "上升",
      },
      {
        title: "不踩雷的早八饮品",
        description: "把咖啡、豆浆、茶饮和热量放在一张表里。",
        heat: 57,
        status: "观望",
      },
    ],
    riskNotes: ["涉及营养建议时避免绝对化表述", "价格会随城市浮动，建议写区间", "食品图片要保证真实可信"],
  },
  {
    id: "oil-skin-care",
    title: "油皮护肤新思路",
    category: "美妆护肤",
    platform: "B站",
    heat: 82.3,
    change: 72,
    status: "上升",
    predictedPeak: 94,
    peakEta: "24 小时内",
    notes: 6500,
    engagement: "118.4w",
    creators: "2,916",
    related: 149,
    trend: [34, 36, 38, 43, 45, 52, 57, 61, 66, 68, 74, 78, 82, 86, 91, 96, 101, 108],
    platformShare: [
      { label: "小红书", value: 49, color: "#ff2bd6" },
      { label: "抖音", value: 18, color: "#12f7ff" },
      { label: "B站", value: 33, color: "#b6ff3b" },
    ],
    angles: [
      {
        title: "油皮不是只需要控油",
        description: "用屏障、保湿和清洁频次重新解释油皮护理。",
        heat: 79,
        status: "上升",
      },
      {
        title: "夏天油皮底妆流程",
        description: "把护肤、妆前和补妆拆成完整流程。",
        heat: 68,
        status: "观望",
      },
      {
        title: "平价油皮空瓶复盘",
        description: "用真实使用周期和肤感做内容可信度。",
        heat: 61,
        status: "上升",
      },
    ],
    riskNotes: ["护肤功效表达需要谨慎", "避免医疗化承诺", "建议区分肤质和场景"],
  },
  {
    id: "ai-efficiency",
    title: "AI 工具提升效率",
    category: "数码科技",
    platform: "B站",
    heat: 77.6,
    change: -18,
    status: "回落",
    predictedPeak: 82,
    peakEta: "已过峰值",
    notes: 5900,
    engagement: "96.2w",
    creators: "2,304",
    related: 201,
    trend: [84, 86, 87, 85, 83, 82, 81, 78, 76, 74, 72, 70, 68, 67, 65, 64, 62, 60],
    platformShare: [
      { label: "小红书", value: 31, color: "#ff2bd6" },
      { label: "抖音", value: 22, color: "#12f7ff" },
      { label: "B站", value: 47, color: "#b6ff3b" },
    ],
    angles: [
      {
        title: "一人公司自动化流程",
        description: "从选题、素材整理、发布排期入手，做可复用流程。",
        heat: 72,
        status: "回落",
      },
      {
        title: "AI 工具避坑清单",
        description: "对比免费额度、输出质量和隐私风险。",
        heat: 66,
        status: "观望",
      },
      {
        title: "学生党 AI 学习流程",
        description: "从课件整理、错题复盘、论文资料归档切入。",
        heat: 63,
        status: "观望",
      },
    ],
    riskNotes: ["工具信息更新快，需要注明版本", "避免夸大自动化能力", "涉及平台账号时要提示隐私边界"],
  },
  {
    id: "camping-list",
    title: "夏日露营装备清单",
    category: "户外运动",
    platform: "小红书",
    heat: 71.4,
    change: 45,
    status: "上升",
    predictedPeak: 86,
    peakEta: "周末前",
    notes: 4200,
    engagement: "82.1w",
    creators: "1,988",
    related: 138,
    trend: [29, 32, 34, 38, 41, 45, 49, 54, 57, 62, 66, 70, 75, 79, 83, 88, 92, 97],
    platformShare: [
      { label: "小红书", value: 55, color: "#ff2bd6" },
      { label: "抖音", value: 30, color: "#12f7ff" },
      { label: "B站", value: 15, color: "#b6ff3b" },
    ],
    angles: [
      {
        title: "新手不过度消费装备表",
        description: "把必须买、可租、可替代分层，降低用户决策压力。",
        heat: 70,
        status: "上升",
      },
      {
        title: "女生独自露营安全清单",
        description: "围绕选址、照明、通信和应急做实用内容。",
        heat: 64,
        status: "上升",
      },
      {
        title: "高温天气露营替代方案",
        description: "引导到城市野餐、天台露营和短时户外。",
        heat: 52,
        status: "观望",
      },
    ],
    riskNotes: ["安全建议要具体可执行", "装备推荐需要标明预算层级", "户外地点信息不要误导用户"],
  },
  {
    id: "slim-outfit",
    title: "显瘦穿搭技巧",
    category: "时尚穿搭",
    platform: "抖音",
    heat: 68.9,
    change: -12,
    status: "回落",
    predictedPeak: 73,
    peakEta: "低位震荡",
    notes: 3800,
    engagement: "74.4w",
    creators: "1,764",
    related: 122,
    trend: [76, 78, 75, 73, 70, 69, 66, 67, 64, 62, 60, 58, 57, 55, 54, 52, 51, 49],
    platformShare: [
      { label: "小红书", value: 50, color: "#ff2bd6" },
      { label: "抖音", value: 38, color: "#12f7ff" },
      { label: "B站", value: 12, color: "#b6ff3b" },
    ],
    angles: [
      {
        title: "显瘦但不制造身材焦虑",
        description: "用比例、版型和舒适度替代单一审美标准。",
        heat: 60,
        status: "观望",
      },
      {
        title: "小个子通勤显高公式",
        description: "做成通勤场景穿搭系列，降低争议风险。",
        heat: 58,
        status: "观望",
      },
      {
        title: "不同身型同一件单品",
        description: "用多人试穿提高可信度。",
        heat: 54,
        status: "回落",
      },
    ],
    riskNotes: ["避免强化单一身材评价", "建议用包容性表达", "回落热点适合做长尾优化"],
  },
  {
    id: "rental-renovation",
    title: "租房改造低成本",
    category: "家居家装",
    platform: "小红书",
    heat: 65.1,
    change: 3,
    status: "观望",
    predictedPeak: 74,
    peakEta: "观察中",
    notes: 3400,
    engagement: "63.9w",
    creators: "1,521",
    related: 118,
    trend: [48, 47, 49, 50, 51, 52, 54, 53, 56, 57, 58, 57, 59, 61, 60, 62, 64, 65],
    platformShare: [
      { label: "小红书", value: 64, color: "#ff2bd6" },
      { label: "抖音", value: 22, color: "#12f7ff" },
      { label: "B站", value: 14, color: "#b6ff3b" },
    ],
    angles: [
      {
        title: "500 元内出租屋改造",
        description: "用清单和前后对比降低用户行动门槛。",
        heat: 67,
        status: "观望",
      },
      {
        title: "不破坏墙面的软装方案",
        description: "围绕可复原、可搬走、房东友好展开。",
        heat: 61,
        status: "观望",
      },
      {
        title: "小户型收纳动线",
        description: "用真实房型图更容易形成收藏。",
        heat: 59,
        status: "上升",
      },
    ],
    riskNotes: ["强调可复原，避免误导破坏房屋", "预算要拆细项", "前后对比图需要真实"],
  },
];

export function filterHotspotsByPlatform(platform: HotspotPlatform, topics = hotspotTopics) {
  return platform === "全平台"
    ? topics
    : platform === "技术圈"
      ? topics.filter((topic) =>
          topic.sources?.some((source) =>
            ["github", "hackernews", "juejin", "sspai", "v2ex", "hellogithub", "ithome", "36kr"].includes(source.platformCode)
          ) || ["GitHub", "Hacker News", "掘金", "少数派", "V2EX", "HelloGitHub", "IT之家", "36氪"].includes(topic.platform)
        )
      : topics.filter((topic) => topic.platform === platform || topic.platformShare.some((share) => share.label === platform));
}

export function HotspotRadarDashboard(props: {
  selectedHotspot: HotspotTopic;
  platform: HotspotPlatform;
  window: HotspotWindow;
  topics?: HotspotTopic[];
  platforms?: HotspotPlatform[];
  sourceHealth?: HotspotSourceHealth[];
  projectReferences?: HotspotProjectReference[];
  generatedAt?: string;
  loading?: boolean;
  error?: string | null;
  onPlatformChange: (platform: HotspotPlatform) => void;
  onWindowChange: (window: HotspotWindow) => void;
  onSelectHotspot: (id: string) => void;
  onGenerateTopic: (angleTitle?: string) => void;
  onAddBenchmark: () => void;
  onRefresh?: () => void;
}) {
  const topics = props.topics?.length ? props.topics : hotspotTopics;
  const visibleTopics = filterHotspotsByPlatform(props.platform, topics);
  const selectedHotspot =
    visibleTopics.find((topic) => topic.id === props.selectedHotspot.id) ?? visibleTopics[0] ?? props.selectedHotspot;
  const risingCount = visibleTopics.filter((topic) => topic.status === "上升" || topic.status === "爆发中").length;
  const alertCount = visibleTopics.filter((topic) => topic.status === "爆发中").length;
  const averageHeat =
    visibleTopics.reduce((sum, topic) => sum + topic.heat, 0) / Math.max(visibleTopics.length, 1);
  const activeSourceCount = props.sourceHealth?.filter((source) => source.ok).length ?? 0;
  const projectReferenceCount = props.projectReferences?.length ?? 0;
  const generatedAt = props.generatedAt
    ? new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(props.generatedAt))
    : "本地兜底";

  return (
    <section className="thin-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-[#05070d] text-slate-100">
      <div className="min-w-0 space-y-3 p-4 lg:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border border-cyan-400/15 bg-[#07101d] px-4 py-3 shadow-[0_0_38px_rgba(18,247,255,0.06)]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-cyan-300/45 bg-cyan-300/10 text-cyan-200">
              <Radar className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold tracking-normal text-white">热点雷达</h2>
              <p className="truncate text-xs text-slate-400">
                数据更新：{generatedAt} · {activeSourceCount || props.sourceHealth?.length || 0} 个来源在线 · {projectReferenceCount || 20} 个开源项目接入
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <SegmentedControl
              values={props.platforms?.length ? props.platforms : hotspotPlatforms}
              value={props.platform}
              onChange={props.onPlatformChange}
            />
            <SegmentedControl values={hotspotWindows} value={props.window} onChange={props.onWindowChange} />
            <button
              type="button"
              onClick={props.onRefresh}
              disabled={props.loading}
              className="inline-flex h-9 items-center gap-2 border border-slate-700 bg-[#0b1220] px-3 text-xs font-medium text-slate-300 transition hover:border-cyan-300/50 hover:text-cyan-100 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", props.loading && "animate-spin")} />
              刷新
            </button>
          </div>
        </div>

        {(props.loading || props.error) && (
          <div
            className={cn(
              "border px-4 py-3 text-sm",
              props.error
                ? "border-amber-300/30 bg-amber-300/8 text-amber-100"
                : "border-cyan-300/20 bg-cyan-300/5 text-cyan-100"
            )}
          >
            {props.error ?? "正在从多平台抓取热点，并做本地聚类分析..."}
          </div>
        )}

        {props.sourceHealth?.length ? <SourceHealthStrip sources={props.sourceHealth} /> : null}
        {props.projectReferences?.length ? <ProjectReferenceStrip projects={props.projectReferences} /> : null}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <MetricCard
            icon={<Flame className="h-6 w-6" />}
            label="热点总量"
            value={visibleTopics.length.toLocaleString("zh-CN")}
            delta="+18.6%"
            tone="cyan"
            spark={[20, 24, 23, 31, 29, 42, 33, 48, 41, 56, 52, 64]}
          />
          <MetricCard
            icon={<ArrowUpRight className="h-6 w-6" />}
            label="上升热点"
            value={risingCount.toString()}
            delta="+23.4%"
            tone="green"
            spark={[24, 25, 26, 31, 33, 37, 41, 48, 52, 60, 67, 76]}
          />
          <MetricCard
            icon={<Zap className="h-6 w-6" />}
            label="爆发预警"
            value={alertCount.toString()}
            delta="+34.7%"
            tone="magenta"
            spark={[16, 19, 28, 24, 31, 36, 29, 34, 47, 38, 42, 45]}
          />
          <MetricCard
            icon={<Gauge className="h-6 w-6" />}
            label="平均热度"
            value={averageHeat.toFixed(1)}
            delta="+8.1"
            tone="cyan"
            spark={[42, 44, 48, 46, 53, 50, 58, 54, 61, 57, 64, 62]}
          />
        </div>

        <div className="grid gap-3 2xl:grid-cols-[minmax(360px,0.88fr)_minmax(0,1.12fr)]">
          <Panel className="min-h-[560px]" title="当前热点" action="查看全部热点">
            <HotspotTable topics={visibleTopics} selectedId={selectedHotspot.id} onSelect={props.onSelectHotspot} />
          </Panel>

          <Panel className="min-h-[560px]" title="趋势走势">
            <TrendDetail selectedHotspot={selectedHotspot} />
          </Panel>
        </div>

        <MobileOpportunitySummary selectedHotspot={selectedHotspot} onGenerateTopic={props.onGenerateTopic} />
      </div>
    </section>
  );
}

export function HotspotOpportunityPanel(props: {
  open: boolean;
  selectedHotspot: HotspotTopic;
  onGenerateTopic: (angleTitle?: string) => void;
  onAddBenchmark: () => void;
}) {
  const selected = props.selectedHotspot;

  return (
    <aside
      className={cn(
        "hidden w-[360px] shrink-0 border-l border-cyan-300/15 bg-[#070b13] text-slate-100 xl:flex xl:flex-col",
        !props.open && "xl:hidden"
      )}
      data-testid="hotspot-opportunity-panel"
    >
      <div className="flex h-14 items-center justify-between border-b border-cyan-300/15 px-4">
        <div>
          <p className="text-sm font-semibold text-white">机会角度</p>
          <p className="text-[11px] text-slate-500">围绕「{selected.title}」生成可行动方向</p>
        </div>
        <Target className="h-4 w-4 text-cyan-300" />
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {selected.angles.map((angle, index) => (
          <button
            key={angle.title}
            type="button"
            onClick={() => props.onGenerateTopic(angle.title)}
            className="w-full border border-cyan-300/15 bg-[#0b1220] p-3 text-left transition hover:border-cyan-300/45 hover:bg-[#0e182b]"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-400">角度 {index + 1}</span>
              <StatusPill status={angle.status} />
            </div>
            <h3 className="text-sm font-semibold text-white">{angle.title}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-400">{angle.description}</p>
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="text-slate-500">预测热度</span>
                <span className="font-semibold text-cyan-200">{angle.heat}</span>
              </div>
              <div className="h-1.5 bg-slate-800">
                <div className="h-full bg-gradient-to-r from-cyan-300 to-[#b6ff3b]" style={{ width: `${angle.heat}%` }} />
              </div>
            </div>
          </button>
        ))}

        <div className="border border-amber-300/30 bg-amber-300/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
            <AlertTriangle className="h-4 w-4" />
            风险提示
          </div>
          <ul className="space-y-1.5 text-xs leading-5 text-amber-100/75">
            {selected.riskNotes.map((note) => (
              <li key={note}>· {note}</li>
            ))}
          </ul>
        </div>

        {selected.sources?.length ? (
          <div className="border border-cyan-300/15 bg-[#0b1220] p-3">
            <p className="mb-2 text-xs font-semibold text-slate-400">原始来源</p>
            <div className="space-y-2">
              {selected.sources.slice(0, 5).map((source) => (
                <a
                  key={source.id}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block border border-slate-800 bg-[#070b13] p-2 text-xs transition hover:border-cyan-300/35 hover:bg-[#0c1726]"
                >
                  <span className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-semibold text-cyan-200">{source.platform}</span>
                    <span className="text-slate-500">#{source.rank}</span>
                  </span>
                  <span className="line-clamp-2 leading-5 text-slate-300">{source.title}</span>
                  {source.rawScore && <span className="mt-1 block text-[11px] text-slate-500">热度：{source.rawScore}</span>}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400">推荐动作</p>
          <button
            type="button"
            onClick={() => props.onGenerateTopic()}
            className="inline-flex h-10 w-full items-center justify-center gap-2 border border-[#ff2bd6] bg-[#ff2bd6]/12 text-sm font-semibold text-[#ff7be9] hover:bg-[#ff2bd6]/20"
          >
            <Zap className="h-4 w-4" />
            生成选题
          </button>
          <button
            type="button"
            onClick={props.onAddBenchmark}
            className="inline-flex h-10 w-full items-center justify-center gap-2 border border-cyan-300/70 bg-cyan-300/10 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/20"
          >
            <Target className="h-4 w-4" />
            加入对标
          </button>
        </div>
      </div>
    </aside>
  );
}

function SegmentedControl<T extends string>(props: {
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex h-9 border border-slate-700 bg-[#080d17] p-0.5">
      {props.values.map((value) => {
        const active = value === props.value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => props.onChange(value)}
            className={cn(
              "px-3 text-xs font-semibold transition",
              active ? "bg-cyan-300/12 text-cyan-200 shadow-[0_0_18px_rgba(18,247,255,0.16)]" : "text-slate-500 hover:text-slate-200"
            )}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}

function MetricCard(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: string;
  tone: "cyan" | "green" | "magenta";
  spark: number[];
}) {
  const toneClass = {
    cyan: "text-cyan-300",
    green: "text-[#b6ff3b]",
    magenta: "text-[#ff2bd6]",
  }[props.tone];

  return (
    <article className="border border-cyan-300/15 bg-[#0b1220] p-4 shadow-[0_0_28px_rgba(18,247,255,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center border border-current/35 bg-current/10", toneClass)}>
          {props.icon}
        </div>
        <Sparkline values={props.spark} className={cn("h-8 w-24", toneClass)} />
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-400">{props.label}</p>
      <div className="mt-1 flex items-end gap-2">
        <span className="text-2xl font-semibold leading-none text-white">{props.value}</span>
        <span className={cn("pb-0.5 text-xs font-semibold", toneClass)}>{props.delta}</span>
      </div>
    </article>
  );
}

function Panel(props: {
  title: string;
  action?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("border border-cyan-300/15 bg-[#08111d]", props.className)}>
      <div className="flex h-12 items-center justify-between border-b border-cyan-300/15 px-4">
        <h3 className="text-base font-semibold text-white">{props.title}</h3>
        {props.action && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500">
            {props.action}
            <ChevronRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      {props.children}
    </section>
  );
}

function SourceHealthStrip(props: { sources: HotspotSourceHealth[] }) {
  const okCount = props.sources.filter((source) => source.ok).length;
  return (
    <div className="grid gap-2 md:grid-cols-[180px_1fr]">
      <div className="border border-cyan-300/15 bg-[#08111d] px-3 py-2">
        <p className="text-[11px] font-semibold text-slate-500">来源状态</p>
        <p className="mt-1 text-sm font-semibold text-white">
          {okCount}/{props.sources.length} 个通道可用
        </p>
      </div>
      <div className="thin-scrollbar flex gap-2 overflow-x-auto border border-cyan-300/15 bg-[#08111d] p-2">
        {props.sources.map((source) => (
          <span
            key={source.platformCode}
            title={source.message ?? source.backend}
            className={cn(
              "inline-flex h-7 shrink-0 items-center gap-1.5 border px-2 text-[11px] font-medium",
              source.ok
                ? "border-cyan-300/25 bg-cyan-300/8 text-cyan-100"
                : "border-amber-300/30 bg-amber-300/8 text-amber-100"
            )}
          >
            <span className={cn("h-1.5 w-1.5", source.ok ? "bg-[#b6ff3b]" : "bg-amber-300")} />
            {source.platform}
            <span className="text-slate-500">{source.count}</span>
            {source.backend ? <span className="max-w-[92px] truncate text-slate-600">{source.backend}</span> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProjectReferenceStrip(props: { projects: HotspotProjectReference[] }) {
  const apiCount = props.projects.filter((project) => project.role === "api-backend").length;
  const sourceCount = props.projects.filter((project) => project.role === "source-map").length;
  const domainCount = props.projects.filter((project) => project.role === "domain-feed").length;

  return (
    <div className="grid gap-2 md:grid-cols-[180px_1fr]">
      <div className="border border-cyan-300/15 bg-[#08111d] px-3 py-2">
        <p className="text-[11px] font-semibold text-slate-500">开源项目接入</p>
        <p className="mt-1 text-sm font-semibold text-white">
          {props.projects.length} 个项目 · {apiCount} 个 API
        </p>
      </div>
      <div className="thin-scrollbar flex gap-2 overflow-x-auto border border-cyan-300/15 bg-[#08111d] p-2">
        <span className="inline-flex h-7 shrink-0 items-center border border-[#b6ff3b]/30 bg-[#b6ff3b]/8 px-2 text-[11px] font-medium text-[#d8ff92]">
          {sourceCount} 个源表
        </span>
        <span className="inline-flex h-7 shrink-0 items-center border border-[#ff2bd6]/30 bg-[#ff2bd6]/8 px-2 text-[11px] font-medium text-[#ff9bea]">
          {domainCount} 个垂直趋势
        </span>
        {props.projects.map((project) => (
          <a
            key={project.repo}
            href={project.url}
            target="_blank"
            rel="noreferrer"
            title={project.influence}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 border border-slate-700 bg-slate-900/80 px-2 text-[11px] font-medium text-slate-300 transition hover:border-cyan-300/45 hover:text-cyan-100"
          >
            <span className="h-1.5 w-1.5 bg-cyan-300" />
            {project.repo}
          </a>
        ))}
      </div>
    </div>
  );
}

function HotspotTable(props: {
  topics: HotspotTopic[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto p-3">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[36px_minmax(150px,1fr)_82px_68px_76px_92px] gap-2 px-2 pb-2 text-[11px] font-semibold text-slate-500">
          <span>#</span>
          <span>话题</span>
          <span>分类</span>
          <span>热度</span>
          <span>趋势</span>
          <span>走势</span>
        </div>
        <div className="space-y-1">
          {props.topics.map((topic, index) => {
            const active = topic.id === props.selectedId;
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => props.onSelect(topic.id)}
                className={cn(
                  "grid h-[46px] w-full grid-cols-[36px_minmax(150px,1fr)_82px_68px_76px_92px] items-center gap-2 border px-2 text-left transition",
                  active
                    ? "border-[#ff2bd6]/50 bg-[#ff2bd6]/10 shadow-[0_0_24px_rgba(255,43,214,0.12)]"
                    : "border-transparent bg-transparent hover:border-cyan-300/25 hover:bg-cyan-300/5"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center text-xs font-semibold text-white",
                    index < 1 ? "bg-[#ff2bd6]" : index < 3 ? "bg-amber-400 text-slate-950" : "bg-slate-700"
                  )}
                >
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{topic.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                    {topic.platform} · {topic.sources?.length ?? topic.notes} 个来源 · {topic.engagement}
                  </span>
                </span>
                <span className="truncate border border-slate-700 bg-slate-900/80 px-2 py-1 text-[11px] text-slate-400">{topic.category}</span>
                <span className="text-sm font-semibold text-white">{topic.heat.toFixed(1)}</span>
                <TrendIndicator status={topic.status} change={topic.change} />
                <Sparkline
                  values={topic.trend.slice(-10)}
                  className={cn("h-6 w-[88px]", topic.change >= 0 ? "text-[#b6ff3b]" : "text-cyan-300")}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TrendDetail(props: { selectedHotspot: HotspotTopic }) {
  const selected = props.selectedHotspot;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-2xl font-semibold text-white">{selected.title}</h3>
            <StatusPill status={selected.status} />
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">
            当前热度和平台扩散都在变化，适合先判断峰值窗口，再决定是做爆款追热点还是做长尾选题。
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-2 border border-slate-700 px-3 text-xs font-medium text-slate-300 hover:border-cyan-300/45 hover:text-cyan-100"
        >
          <Bookmark className="h-3.5 w-3.5" />
          收藏
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SignalStat label="当前热度" value={selected.heat.toFixed(1)} tone="magenta" />
        <SignalStat label="峰值预测" value={`${selected.predictedPeak} ±10`} tone="magenta" />
        <SignalStat label="预计达峰" value={selected.peakEta} tone="cyan" />
        <SignalStat label="热度值" value={selected.status} tone="green" />
      </div>

      <TrendChart topic={selected} />

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="border border-cyan-300/15 bg-[#0b1220] p-4">
          <p className="mb-3 text-sm font-semibold text-slate-200">相关数据</p>
          <div className="grid grid-cols-2 gap-3">
            <DataPoint icon={<Activity className="h-4 w-4" />} label="聚合条目" value={`${selected.sources?.length ?? selected.notes}`} tone="magenta" />
            <DataPoint icon={<LineChart className="h-4 w-4" />} label="热度合计" value={selected.engagement} tone="cyan" />
            <DataPoint icon={<Target className="h-4 w-4" />} label="来源平台" value={selected.creators} tone="amber" />
            <DataPoint icon={<Radar className="h-4 w-4" />} label="关键词" value={(selected.keywords?.length ?? selected.related).toString()} tone="violet" />
          </div>
          {selected.keywords?.length ? (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {selected.keywords.slice(0, 8).map((keyword) => (
                <span key={keyword} className="border border-slate-700 bg-slate-900/80 px-2 py-1 text-[11px] text-slate-400">
                  {keyword}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="border border-cyan-300/15 bg-[#0b1220] p-4">
          <p className="mb-3 text-sm font-semibold text-slate-200">热度分布（平台）</p>
          <div className="flex items-center gap-5">
            <DonutChart items={selected.platformShare} />
            <div className="min-w-0 flex-1 space-y-2">
              {selected.platformShare.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-2 text-slate-400">
                    <span className="h-2.5 w-2.5" style={{ backgroundColor: item.color }} />
                    {item.label}
                  </span>
                  <span className="font-semibold text-slate-200">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignalStat(props: { label: string; value: string; tone: "magenta" | "cyan" | "green" }) {
  const toneClass = {
    magenta: "text-[#ff2bd6]",
    cyan: "text-cyan-200",
    green: "text-[#b6ff3b]",
  }[props.tone];

  return (
    <div className="border-l border-cyan-300/15 bg-[#0b1220] px-4 py-3">
      <p className="text-[11px] font-semibold text-slate-500">{props.label}</p>
      <p className={cn("mt-2 truncate text-xl font-semibold", toneClass)}>{props.value}</p>
    </div>
  );
}

function DataPoint(props: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "magenta" | "cyan" | "amber" | "violet";
}) {
  const toneClass = {
    magenta: "text-[#ff2bd6]",
    cyan: "text-cyan-300",
    amber: "text-amber-300",
    violet: "text-violet-300",
  }[props.tone];

  return (
    <div className="flex items-center gap-2">
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center border border-current/30 bg-current/10", toneClass)}>
        {props.icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] text-slate-500">{props.label}</span>
        <span className="block truncate text-sm font-semibold text-white">{props.value}</span>
      </span>
    </div>
  );
}

function StatusPill(props: { status: HotspotStatus }) {
  const style = {
    爆发中: "border-[#ff2bd6]/60 bg-[#ff2bd6]/12 text-[#ff7be9]",
    上升: "border-[#b6ff3b]/60 bg-[#b6ff3b]/10 text-[#b6ff3b]",
    回落: "border-cyan-300/50 bg-cyan-300/10 text-cyan-200",
    观望: "border-amber-300/50 bg-amber-300/10 text-amber-200",
  }[props.status];

  return (
    <span className={cn("inline-flex h-7 items-center gap-1 border px-2 text-xs font-semibold", style)}>
      {props.status === "爆发中" && <Flame className="h-3.5 w-3.5" />}
      {props.status === "上升" && <TrendingUp className="h-3.5 w-3.5" />}
      {props.status === "回落" && <TrendingDown className="h-3.5 w-3.5" />}
      {props.status === "观望" && <ClockIcon />}
      {props.status}
    </span>
  );
}

function TrendIndicator(props: { status: HotspotStatus; change: number }) {
  const positive = props.change >= 0;
  const color =
    props.status === "爆发中"
      ? "text-[#ff2bd6]"
      : positive
        ? "text-[#b6ff3b]"
        : "text-cyan-300";

  return (
    <span className={cn("flex items-center gap-1 text-xs font-semibold", color)}>
      {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {positive ? "+" : ""}
      {props.change}%
    </span>
  );
}

function Sparkline(props: { values: number[]; className?: string }) {
  const points = toPolylinePoints(props.values, 110, 34, 2);

  return (
    <svg className={props.className} viewBox="0 0 110 34" role="img" aria-label="趋势迷你图">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrendChart(props: { topic: HotspotTopic }) {
  const values = props.topic.trend;
  const line = toPolylinePoints(values, 620, 260, 18);
  const area = toAreaPath(values, 620, 260, 18);
  const forecast = toPolylinePoints(values.slice(10), 300, 178, 10);

  return (
    <div className="border border-cyan-300/15 bg-[#06101b] p-4">
      <svg className="h-[300px] w-full overflow-visible" viewBox="0 0 660 300" role="img" aria-label={`${props.topic.title} 热度走势图`}>
        <defs>
          <linearGradient id="hotspot-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ff2bd6" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#ff2bd6" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="hotspot-line" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#12f7ff" />
            <stop offset="100%" stopColor="#ff2bd6" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((lineIndex) => (
          <line
            key={`h-${lineIndex}`}
            x1="18"
            x2="638"
            y1={28 + lineIndex * 52}
            y2={28 + lineIndex * 52}
            stroke="#1f3447"
            strokeDasharray="4 6"
            strokeWidth="1"
          />
        ))}
        {[0, 1, 2, 3, 4, 5].map((lineIndex) => (
          <line
            key={`v-${lineIndex}`}
            x1={18 + lineIndex * 124}
            x2={18 + lineIndex * 124}
            y1="28"
            y2="236"
            stroke="#16283a"
            strokeDasharray="4 8"
            strokeWidth="1"
          />
        ))}
        <path d={area} fill="url(#hotspot-area)" />
        <polyline points={line} fill="none" stroke="url(#hotspot-line)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="342" x2="342" y1="28" y2="236" stroke="#9fb3c8" strokeDasharray="5 7" strokeWidth="1.2" />
        <text x="18" y="270" fill="#64748b" fontSize="12">11:45</text>
        <text x="170" y="270" fill="#64748b" fontSize="12">12:15</text>
        <text x="322" y="270" fill="#64748b" fontSize="12">12:45</text>
        <text x="474" y="270" fill="#64748b" fontSize="12">13:15</text>
        <text x="598" y="270" fill="#64748b" fontSize="12">13:45</text>
        <text x="62" y="58" fill="#94a3b8" fontSize="12">历史</text>
        <text x="560" y="58" fill="#94a3b8" fontSize="12">预测</text>
        <circle cx="342" cy="116" r="5" fill="#ff2bd6" stroke="#fff" strokeWidth="2" />
        <text x="320" y="104" fill="#ff2bd6" fontSize="14" fontWeight="700">{props.topic.heat.toFixed(1)}</text>
        <g transform="translate(320 40)" opacity="0.16">
          <polyline points={forecast} fill="none" stroke="#ff2bd6" strokeWidth="4" strokeDasharray="8 8" />
        </g>
      </svg>
      <div className="flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-8 bg-[#ff2bd6]" />历史热度</span>
        <span className="inline-flex items-center gap-2"><span className="h-0.5 w-8 border-t border-dashed border-[#ff2bd6]" />预测热度</span>
        <span className="inline-flex items-center gap-2"><span className="h-3 w-5 bg-[#ff2bd6]/20" />置信区间</span>
      </div>
    </div>
  );
}

function DonutChart(props: { items: HotspotTopic["platformShare"] }) {
  let offset = 25;
  const radius = 35;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg className="h-28 w-28 shrink-0 -rotate-90" viewBox="0 0 100 100" role="img" aria-label="平台热度分布">
      <circle cx="50" cy="50" r={radius} fill="transparent" stroke="#1e293b" strokeWidth="14" />
      {props.items.map((item) => {
        const dash = (item.value / 100) * circumference;
        const circle = (
          <circle
            key={item.label}
            cx="50"
            cy="50"
            r={radius}
            fill="transparent"
            stroke={item.color}
            strokeWidth="14"
            strokeDasharray={`${dash} ${circumference - dash}`}
            strokeDashoffset={-offset}
          />
        );
        offset += dash;
        return circle;
      })}
      <circle cx="50" cy="50" r="22" fill="#0b1220" />
    </svg>
  );
}

function MobileOpportunitySummary(props: {
  selectedHotspot: HotspotTopic;
  onGenerateTopic: (angleTitle?: string) => void;
}) {
  return (
    <section className="border border-cyan-300/15 bg-[#08111d] p-4 xl:hidden">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">机会角度</h3>
          <p className="text-xs text-slate-500">移动端摘要：{props.selectedHotspot.title}</p>
        </div>
        <Target className="h-4 w-4 text-cyan-300" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {props.selectedHotspot.angles.map((angle) => (
          <button
            key={angle.title}
            type="button"
            onClick={() => props.onGenerateTopic(angle.title)}
            className="border border-cyan-300/15 bg-[#0b1220] p-3 text-left hover:border-cyan-300/45"
          >
            <p className="text-sm font-semibold text-white">{angle.title}</p>
            <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">{angle.description}</p>
          </button>
        ))}
      </div>
    </section>
  );
}

function ClockIcon() {
  return <span className="h-2.5 w-2.5 border border-current" />;
}

function toPolylinePoints(values: number[], width: number, height: number, padding: number) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);
  return values
    .map((value, index) => {
      const x = padding + (index / Math.max(values.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / range) * (height - padding * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function toAreaPath(values: number[], width: number, height: number, padding: number) {
  const points = toPolylinePoints(values, width, height, padding).split(" ");
  const first = points[0] ?? `${padding},${height - padding}`;
  const last = points[points.length - 1] ?? `${width - padding},${height - padding}`;
  return `M ${first} L ${points.slice(1).join(" L ")} L ${last.split(",")[0]},${height - padding} L ${first.split(",")[0]},${height - padding} Z`;
}
