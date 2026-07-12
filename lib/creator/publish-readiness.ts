import { validateStoryboard, formatSeconds } from "@/lib/content/storyboard";

/**
 * C8 发布就绪评估(纯函数,无数据库、无网络)。
 *
 * 服务端(对话内 publish.prepare 就绪卡)与客户端(Artifact 发布清单)
 * 共用同一份规则,保证清单预览与对话卡结论一致。
 * 本模块只做内容层检查;AiToEarn 凭证与账号状态由调用方单独查询本地库提供,
 * 这里不调用任何外部供应商,也不产生发布动作。
 *
 * 级别语义:
 * - block:内容明显不完整,移交发布中心会白跑一趟(如无标题、无正文、无分镜)。
 * - warn:可以移交,但发布前建议处理(超长、缺标签、时间轴断裂、风险表述)。
 * - pass:该项检查通过。
 */

export type ReadinessLevel = "pass" | "warn" | "block";

export type ReadinessItem = {
  /** 稳定检查项键,如 title / pages.empty / shots.timeline */
  key: string;
  label: string;
  level: ReadinessLevel;
  detail?: string;
};

export type ReadinessState = "ready" | "warnings" | "blocked";

export type ReadinessInput = {
  contentKind: "xhs_graphic" | "douyin_video_script";
  title: string;
  body: string;
  structured: Record<string, unknown> | null;
  /** structured 中没有 tags 时的兜底(GeneratedContent.tags) */
  fallbackTags?: string[];
};

export type ReadinessAssessment = {
  items: ReadinessItem[];
  state: ReadinessState;
  blockers: number;
  warnings: number;
};

/** 保守的夸大/绝对化表述列表:只收多字词,避免「最近」「第一次」这类误报。 */
const RISKY_PHRASES = [
  "史上最",
  "全网第一",
  "全网最低",
  "绝对有效",
  "百分百",
  "包治",
  "根治",
  "零风险",
  "稳赚",
  "秒杀全网",
  "国家级",
  "最高级",
];

const XHS_TITLE_DISPLAY_LIMIT = 20;
const XHS_BODY_LIMIT = 1000;
const XHS_MAX_PAGES = 18;
const DOUYIN_TITLE_LIMIT = 30;
const DOUYIN_CAPTION_LIMIT = 1000;
const TAGS_MIN_SUGGESTED = 3;
const TAGS_MAX_SUGGESTED = 10;

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map((item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? (item as Record<string, unknown>)
      : {},
  );
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArrayOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "")
    : [];
}

function tagsOf(input: ReadinessInput): string[] {
  const structuredTags = stringArrayOf(input.structured?.tags);
  if (structuredTags.length > 0) return structuredTags;
  return (input.fallbackTags ?? []).filter((tag) => tag.trim() !== "");
}

/** 列出命中的风险表述(去重,最多 5 个)。 */
function riskyPhrasesIn(text: string): string[] {
  const hits = RISKY_PHRASES.filter((phrase) => text.includes(phrase));
  return [...new Set(hits)].slice(0, 5);
}

function listPositions(indices: number[], unit: string): string {
  return indices
    .slice(0, 5)
    .map((index) => `第 ${index + 1} ${unit}`)
    .join("、");
}

function tagItems(input: ReadinessInput): ReadinessItem {
  const tags = tagsOf(input);
  if (tags.length === 0) {
    return {
      key: "tags",
      label: "话题标签",
      level: "warn",
      detail: `还没有话题标签,建议添加 ${TAGS_MIN_SUGGESTED}–6 个以获得分发。`,
    };
  }
  if (tags.length > TAGS_MAX_SUGGESTED) {
    return {
      key: "tags",
      label: "话题标签",
      level: "warn",
      detail: `已有 ${tags.length} 个标签,超过 ${TAGS_MAX_SUGGESTED} 个后权重会被稀释,建议精简。`,
    };
  }
  return {
    key: "tags",
    label: "话题标签",
    level: "pass",
    detail: `已有 ${tags.length} 个话题标签。`,
  };
}

function riskItem(input: ReadinessInput, extraTexts: string[]): ReadinessItem {
  const scanned = [input.title, input.body, ...extraTexts].join("\n");
  const hits = riskyPhrasesIn(scanned);
  const notes = stringArrayOf(input.structured?.riskNotes);
  const shotRisks = asRecordArray(input.structured?.shots)
    .map((shot) => stringOf(shot.risk).trim())
    .filter(Boolean);
  const details: string[] = [];
  if (hits.length) details.push(`出现需复核的表述:${hits.map((hit) => `「${hit}」`).join("")}。`);
  if (notes.length) details.push(`生成时标注了 ${notes.length} 条风险提示:${notes[0].slice(0, 80)}${notes.length > 1 ? " 等" : ""}。`);
  if (shotRisks.length) details.push(`${shotRisks.length} 个分镜带风险备注。`);
  if (details.length === 0) {
    return {
      key: "risk",
      label: "风险表述",
      level: "pass",
      detail: "基础检查未发现明显夸大或绝对化表述(不能替代平台审核)。",
    };
  }
  return { key: "risk", label: "风险表述", level: "warn", detail: details.join(" ") };
}

function assessXhs(input: ReadinessInput): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const title = input.title.trim();
  const body = input.body.trim();

  if (!title) {
    items.push({ key: "title", label: "标题", level: "block", detail: "标题为空,发布前必须填写。" });
  } else if (title.length > XHS_TITLE_DISPLAY_LIMIT) {
    items.push({
      key: "title",
      label: "标题",
      level: "warn",
      detail: `标题 ${title.length} 字,小红书展示约 ${XHS_TITLE_DISPLAY_LIMIT} 字,超出部分可能被截断。`,
    });
  } else {
    items.push({ key: "title", label: "标题", level: "pass", detail: `标题已填写(${title.length} 字)。` });
  }

  if (!body) {
    items.push({ key: "body", label: "完整正文", level: "block", detail: "正文为空,发布前必须填写。" });
  } else if (body.length > XHS_BODY_LIMIT) {
    items.push({
      key: "body",
      label: "完整正文",
      level: "warn",
      detail: `正文 ${body.length} 字,超过小红书约 ${XHS_BODY_LIMIT} 字的上限,发布时可能被截断。`,
    });
  } else if (body.length < 50) {
    items.push({ key: "body", label: "完整正文", level: "warn", detail: `正文只有 ${body.length} 字,内容偏薄。` });
  } else {
    items.push({ key: "body", label: "完整正文", level: "pass", detail: `正文 ${body.length} 字。` });
  }

  const pages = asRecordArray(input.structured?.pages);
  if (pages.length === 0) {
    items.push({
      key: "pages",
      label: "分页结构",
      level: "warn",
      detail: "没有分页结构:发布时需要自行准备图片素材,无法按页对照制作。",
    });
  } else {
    const emptyPages = pages
      .map((page, index) => (stringOf(page.body).trim() === "" ? index : -1))
      .filter((index) => index >= 0);
    if (emptyPages.length > 0) {
      items.push({
        key: "pages.empty",
        label: "分页结构",
        level: "warn",
        detail: `${listPositions(emptyPages, "页")}正文为空,请补齐或删除空页。`,
      });
    } else if (pages.length > XHS_MAX_PAGES) {
      items.push({
        key: "pages",
        label: "分页结构",
        level: "warn",
        detail: `共 ${pages.length} 页,超过小红书最多 ${XHS_MAX_PAGES} 张图的限制。`,
      });
    } else {
      items.push({ key: "pages", label: "分页结构", level: "pass", detail: `共 ${pages.length} 页,页面正文完整。` });
    }
  }

  items.push(tagItems(input));
  items.push(riskItem(input, pages.map((page) => stringOf(page.body))));
  return items;
}

function assessDouyin(input: ReadinessInput): ReadinessItem[] {
  const items: ReadinessItem[] = [];
  const title = input.title.trim();
  const caption = input.body.trim();
  const structured = input.structured;
  const shots = asRecordArray(structured?.shots);

  if (!title) {
    items.push({ key: "title", label: "标题", level: "block", detail: "标题为空,发布前必须填写。" });
  } else if (title.length > DOUYIN_TITLE_LIMIT) {
    items.push({
      key: "title",
      label: "标题",
      level: "warn",
      detail: `标题 ${title.length} 字,建议控制在 ${DOUYIN_TITLE_LIMIT} 字内。`,
    });
  } else {
    items.push({ key: "title", label: "标题", level: "pass", detail: `标题已填写(${title.length} 字)。` });
  }

  const hook = stringOf(structured?.hook).trim();
  if (!hook) {
    items.push({
      key: "hook",
      label: "开场钩子",
      level: "warn",
      detail: "开场钩子为空:前 3 秒没有抓人开场,完播率会明显下降。",
    });
  } else {
    items.push({ key: "hook", label: "开场钩子", level: "pass", detail: "开场钩子已填写。" });
  }

  if (shots.length === 0) {
    items.push({
      key: "shots",
      label: "分镜时间轴",
      level: "block",
      detail: "还没有任何分镜:抖音脚本至少需要一条分镜时间轴才能进入成片与发布。",
    });
  } else {
    const emptyVoiceovers = shots
      .map((shot, index) => (stringOf(shot.voiceover).trim() === "" ? index : -1))
      .filter((index) => index >= 0);
    if (emptyVoiceovers.length > 0) {
      items.push({
        key: "shots.voiceover",
        label: "分镜口播",
        level: "warn",
        detail: `${listPositions(emptyVoiceovers, "镜")}没有口播文案。`,
      });
    } else {
      items.push({ key: "shots.voiceover", label: "分镜口播", level: "pass", detail: `共 ${shots.length} 镜,口播完整。` });
    }

    const timeline = validateStoryboard(structured);
    if (timeline.issues.length > 0) {
      items.push({
        key: "shots.timeline",
        label: "时间轴连续性",
        level: "warn",
        detail: timeline.issues.slice(0, 3).map((issue) => issue.message).join(" "),
      });
    } else {
      items.push({
        key: "shots.timeline",
        label: "时间轴连续性",
        level: "pass",
        detail: `时间轴连续,全片 ${formatSeconds(timeline.timelineEnd)}。`,
      });
    }
  }

  if (!caption) {
    items.push({ key: "caption", label: "发布文案", level: "block", detail: "发布文案为空,发布前必须填写。" });
  } else if (caption.length > DOUYIN_CAPTION_LIMIT) {
    items.push({
      key: "caption",
      label: "发布文案",
      level: "warn",
      detail: `发布文案 ${caption.length} 字,建议控制在 ${DOUYIN_CAPTION_LIMIT} 字内。`,
    });
  } else {
    items.push({ key: "caption", label: "发布文案", level: "pass", detail: `发布文案 ${caption.length} 字。` });
  }

  items.push(tagItems(input));
  items.push(riskItem(input, [hook, ...shots.map((shot) => stringOf(shot.voiceover))]));
  return items;
}

export function readinessStateOf(items: ReadinessItem[]): ReadinessState {
  if (items.some((item) => item.level === "block")) return "blocked";
  if (items.some((item) => item.level === "warn")) return "warnings";
  return "ready";
}

/** 对当前草稿/版本做平台特定的发布就绪评估。 */
export function assessContentReadiness(input: ReadinessInput): ReadinessAssessment {
  const items =
    input.contentKind === "douyin_video_script" ? assessDouyin(input) : assessXhs(input);
  return {
    items,
    state: readinessStateOf(items),
    blockers: items.filter((item) => item.level === "block").length,
    warnings: items.filter((item) => item.level === "warn").length,
  };
}

export function readinessStateLabel(state: ReadinessState): string {
  if (state === "ready") return "已就绪";
  if (state === "warnings") return "有提醒";
  return "有阻塞";
}

/**
 * 把阻塞与提醒项转成一条可直接发送的修改指令(就绪卡「复制待处理项」用)。
 * 没有待处理项时返回空字符串。
 */
export function missingItemsPrompt(items: ReadinessItem[]): string {
  const pending = items.filter((item) => item.level !== "pass");
  if (pending.length === 0) return "";
  const lines = pending.map(
    (item, index) =>
      `${index + 1}. [${item.level === "block" ? "阻塞" : "提醒"}] ${item.label}:${item.detail ?? "需要处理"}`,
  );
  return ["请帮我处理这份内容发布前的问题:", ...lines].join("\n");
}
