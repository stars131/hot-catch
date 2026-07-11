/**
 * 修订版本的 Markdown 构建与手动草稿合并。
 *
 * Worker 生成、Artifact 面板手动保存共用同一份构建逻辑,
 * 保证 fullMarkdown / structuredContent 在不同来源的版本之间形状一致。
 * 输入按 unknown 防御式读取:旧版本的 structuredContent 可能缺字段。
 */

export type XhsMarkdownInput = {
  title: string;
  pages: Array<{ pageNumber: number; heading: string; body: string }>;
  bodyText: string;
  tags: string[];
};

export type DouyinMarkdownInput = {
  title: string;
  shots: Array<{
    startSec: number;
    endSec: number;
    voiceover: string;
    visual: string;
    subtitle: string;
    camera: string;
    transition: string;
    music: string;
    risk?: string;
  }>;
  caption: string;
  tags: string[];
};

export function toXhsMarkdown(value: XhsMarkdownInput): string {
  return [
    `# ${value.title}`,
    ...value.pages.map(
      (page) => `## 第 ${page.pageNumber} 页：${page.heading}\n\n${page.body}`,
    ),
    value.bodyText,
    value.tags.map((tag) => `#${tag}`).join(" "),
  ].join("\n\n");
}

export function toDouyinMarkdown(value: DouyinMarkdownInput): string {
  const rows = value.shots.map(
    (shot) =>
      `| ${shot.startSec}-${shot.endSec}s | ${shot.voiceover} | ${shot.visual} | ${shot.subtitle} | ${shot.camera} | ${shot.transition} | ${shot.music} | ${shot.risk || "无"} |`,
  );
  return [
    `# ${value.title}`,
    "| 时间 | 口播 | 画面 | 字幕 | 镜头 | 转场 | 音乐 | 风险 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    value.caption,
    value.tags.map((tag) => `#${tag}`).join(" "),
  ].join("\n\n");
}

export type ManualRevisionPayload = {
  title: string | null;
  bodyText: string | null;
  structuredContent?: unknown;
  fullMarkdown: string | null;
};

/**
 * 把手动编辑的标题/正文合并进既有 structuredContent,并重建 fullMarkdown。
 * - 小红书:正文写入 bodyText;抖音:正文写入 caption。
 * - 结构字段(分页/分镜)以草稿中的编辑结果为准;
 *   标签/风险等字符串列表在落库前清掉空行(编辑器允许暂存空行)。
 * - 没有结构化数据时退化为「标题 + 正文 + 标签」的简单 Markdown。
 */
export function buildManualRevisionPayload(params: {
  contentKind: "xhs_graphic" | "douyin_video_script";
  baseStructuredContent: unknown;
  title: string;
  bodyText: string;
}): ManualRevisionPayload {
  const title = params.title.trim();
  const body = params.bodyText;
  const base = asRecord(params.baseStructuredContent);
  const hasStructure = base !== null;

  let structuredContent: Record<string, unknown> | undefined;
  if (hasStructure) {
    structuredContent = dropEmptyListEntries({ ...base, title: title || base.title });
    if (params.contentKind === "xhs_graphic") structuredContent.bodyText = body;
    else structuredContent.caption = body;
  }

  return {
    title: title || null,
    bodyText: body || null,
    structuredContent,
    fullMarkdown: buildMarkdown(params.contentKind, title, body, structuredContent),
  };
}

/** 编辑器中的字符串列表允许暂存空行;保存时过滤,避免落库垃圾数据。 */
const STRING_LIST_KEYS = ["tags", "riskNotes", "coverTextOptions", "titleOptions"] as const;

function dropEmptyListEntries(
  structured: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...structured };
  for (const key of STRING_LIST_KEYS) {
    if (!Array.isArray(next[key])) continue;
    next[key] = (next[key] as unknown[]).filter(
      (item) => typeof item !== "string" || item.trim().length > 0,
    );
  }
  return next;
}

function buildMarkdown(
  contentKind: "xhs_graphic" | "douyin_video_script",
  title: string,
  body: string,
  structured: Record<string, unknown> | undefined,
): string {
  const tags = stringArray(structured?.tags);
  if (contentKind === "xhs_graphic") {
    const pages = recordArray(structured?.pages);
    if (pages.length > 0) {
      return toXhsMarkdown({
        title,
        pages: pages.map((page, index) => ({
          pageNumber: numberOf(page.pageNumber, index + 1),
          heading: stringOf(page.heading),
          body: stringOf(page.body),
        })),
        bodyText: body,
        tags,
      });
    }
  } else {
    const shots = recordArray(structured?.shots);
    if (shots.length > 0) {
      return toDouyinMarkdown({
        title,
        shots: shots.map((shot) => ({
          startSec: numberOf(shot.startSec, 0),
          endSec: numberOf(shot.endSec, 0),
          voiceover: stringOf(shot.voiceover),
          visual: stringOf(shot.visual),
          subtitle: stringOf(shot.subtitle),
          camera: stringOf(shot.camera),
          transition: stringOf(shot.transition),
          music: stringOf(shot.music),
          risk: stringOf(shot.risk),
        })),
        caption: body,
        tags,
      });
    }
  }
  return [`# ${title || "未命名"}`, body, tags.map((tag) => `#${tag}`).join(" ")]
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map((item) => asRecord(item) ?? {})
    : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOf(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
