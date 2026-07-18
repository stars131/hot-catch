/**
 * 修订版本的 Markdown 构建与手动草稿合并。
 *
 * Worker 生成、Artifact 面板手动保存共用同一份构建逻辑,
 * 保证 fullMarkdown / structuredContent 在不同来源的版本之间形状一致。
 * 输入按 unknown 防御式读取:旧版本的 structuredContent 可能缺字段。
 */

import type { ContentKindId } from "@/lib/platforms/registry";

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
  contentKind: ContentKindId;
  baseStructuredContent: unknown;
  title: string;
  bodyText: string;
}): ManualRevisionPayload {
  const title = params.title.trim();
  const body = params.bodyText;
  const base = asRecord(params.baseStructuredContent);
  const hasStructure = base !== null;
  let revisionBody = body;

  let structuredContent: Record<string, unknown> | undefined;
  if (hasStructure) {
    structuredContent = dropEmptyListEntries({ ...base, title: title || base.title });
    if (params.contentKind === "xhs_graphic") structuredContent.bodyText = body;
    else if (params.contentKind === "douyin_video_script") structuredContent.caption = body;
    else if (params.contentKind === "youtube_video_package") structuredContent.description = body;
    else if (params.contentKind === "tiktok_short_video_script") structuredContent.caption = body;
    else if (params.contentKind === "instagram_carousel") structuredContent.caption = body;
    else if (params.contentKind === "reddit_post") structuredContent.bodyMarkdown = body;
    else if (params.contentKind === "x_thread") {
      revisionBody = recordArray(structuredContent.posts)
        .map((post) => stringOf(post.text))
        .filter(Boolean)
        .join("\n\n");
    }
  }

  return {
    title: title || null,
    bodyText: revisionBody || null,
    structuredContent,
    fullMarkdown: buildMarkdown(params.contentKind, title, revisionBody, structuredContent),
  };
}

/** 编辑器中的字符串列表允许暂存空行;保存时过滤,避免落库垃圾数据。 */
const STRING_LIST_KEYS = [
  "tags",
  "hashtags",
  "riskNotes",
  "coverTextOptions",
  "titleOptions",
  "disclosureNotes",
  "subredditSuggestions",
] as const;

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
  contentKind: ContentKindId,
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
  } else if (contentKind === "douyin_video_script") {
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
  } else if (contentKind === "youtube_video_package") {
    const sections = recordArray(structured?.sections);
    const chapters = recordArray(structured?.chapters);
    return [
      `# ${title || "未命名"}`,
      stringOf(structured?.thumbnailText) ? `**Thumbnail:** ${stringOf(structured?.thumbnailText)}` : "",
      stringOf(structured?.hook) ? `**Hook:** ${stringOf(structured?.hook)}` : "",
      ...sections.map((section) => [
        `## ${timecode(numberOf(section.startSec, 0))}–${timecode(numberOf(section.endSec, 0))} ${stringOf(section.heading)}`,
        stringOf(section.narration),
        stringOf(section.visualDirection) ? `**Visual:** ${stringOf(section.visualDirection)}` : "",
      ].filter(Boolean).join("\n\n")),
      chapters.length ? `## Chapters\n\n${chapters.map((chapter) => `${timecode(numberOf(chapter.timeSec, 0))} ${stringOf(chapter.title)}`).join("\n")}` : "",
      body ? `## Description\n\n${body}` : "",
      stringArray(structured?.tags).length ? `## Tags\n\n${stringArray(structured?.tags).join(", ")}` : "",
      stringOf(structured?.callToAction) ? `## CTA\n\n${stringOf(structured?.callToAction)}` : "",
    ].filter(Boolean).join("\n\n");
  } else if (contentKind === "tiktok_short_video_script") {
    const shots = recordArray(structured?.shots);
    return [
      `# ${title || "未命名"}`,
      stringOf(structured?.hook) ? `**Hook:** ${stringOf(structured?.hook)}` : "",
      shots.length ? [
        "| Time | Voiceover | Visual | On-screen text | Camera | Transition |",
        "| --- | --- | --- | --- | --- | --- |",
        ...shots.map((shot) => `| ${numberOf(shot.startSec, 0)}-${numberOf(shot.endSec, 0)}s | ${tableCell(shot.voiceover)} | ${tableCell(shot.visual)} | ${tableCell(shot.onScreenText)} | ${tableCell(shot.camera)} | ${tableCell(shot.transition)} |`),
      ].join("\n") : "",
      body ? `## Caption\n\n${body}` : "",
      stringArray(structured?.hashtags).length ? `## Hashtags\n\n${stringArray(structured?.hashtags).map(hashTag).join(" ")}` : "",
      stringOf(structured?.musicDirection) ? `## Music\n\n${stringOf(structured?.musicDirection)}` : "",
      stringOf(structured?.callToAction) ? `## CTA\n\n${stringOf(structured?.callToAction)}` : "",
    ].filter(Boolean).join("\n\n");
  } else if (contentKind === "instagram_carousel") {
    const slides = recordArray(structured?.slides);
    return [
      `# ${title || "未命名"}`,
      stringOf(structured?.coverText) ? `**Cover:** ${stringOf(structured?.coverText)}` : "",
      ...slides.map((slide, index) => [
        `## Slide ${numberOf(slide.slideNumber, index + 1)}: ${stringOf(slide.heading)}`,
        stringOf(slide.body),
        stringOf(slide.visualDirection) ? `**Visual:** ${stringOf(slide.visualDirection)}` : "",
        stringOf(slide.altText) ? `**Alt text:** ${stringOf(slide.altText)}` : "",
      ].filter(Boolean).join("\n\n")),
      body ? `## Caption\n\n${body}` : "",
      stringArray(structured?.hashtags).length ? `## Hashtags\n\n${stringArray(structured?.hashtags).map(hashTag).join(" ")}` : "",
      stringOf(structured?.callToAction) ? `## CTA\n\n${stringOf(structured?.callToAction)}` : "",
    ].filter(Boolean).join("\n\n");
  } else if (contentKind === "x_thread") {
    const posts = recordArray(structured?.posts);
    return [
      `# ${title || "未命名"}`,
      ...posts.map((post, index) => [
        `## ${numberOf(post.index, index + 1)}/${posts.length}`,
        stringOf(post.text),
        stringOf(post.mediaSuggestion) ? `**Media:** ${stringOf(post.mediaSuggestion)}` : "",
      ].filter(Boolean).join("\n\n")),
      stringOf(structured?.callToAction) ? `## CTA\n\n${stringOf(structured?.callToAction)}` : "",
    ].filter(Boolean).join("\n\n");
  } else if (contentKind === "reddit_post") {
    const communities = stringArray(structured?.subredditSuggestions);
    return [
      `# ${title || "未命名"}`,
      stringOf(structured?.audience) ? `**Audience:** ${stringOf(structured?.audience)}` : "",
      communities.length ? `**Suggested communities (verify rules manually):** ${communities.join(", ")}` : "",
      body,
      stringOf(structured?.tldr) ? `## TL;DR\n\n${stringOf(structured?.tldr)}` : "",
      stringOf(structured?.discussionPrompt) ? `## Discussion prompt\n\n${stringOf(structured?.discussionPrompt)}` : "",
      stringOf(structured?.flairSuggestion) ? `**Suggested flair:** ${stringOf(structured?.flairSuggestion)}` : "",
      stringOf(structured?.disclosure) ? `**Disclosure:** ${stringOf(structured?.disclosure)}` : "",
    ].filter(Boolean).join("\n\n");
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

function tableCell(value: unknown): string {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function timecode(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function hashTag(value: string): string {
  return value.startsWith("#") ? value : `#${value}`;
}
