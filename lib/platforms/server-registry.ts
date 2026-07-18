import { z } from "zod";
import {
  douyinVideoScriptOutputSchema,
  xhsGraphicOutputSchema,
} from "@/lib/content/schemas";
import { toDouyinMarkdown, toXhsMarkdown } from "@/lib/content/markdown";
import { REFERENCE_GUARD_INSTRUCTION } from "@/lib/creator/reference-brief";
import {
  CONTENT_LOCALE_LABELS,
  PLATFORM_DEFINITIONS,
  type ContentKindId,
  type ContentLocale,
  type PlatformId,
  type UiLocale,
} from "@/lib/platforms/registry";

const riskNotesSchema = z.array(z.string().max(500)).max(12).default([]);

const XHS_OUTPUT_CONTRACT = `JSON 字段约束：
- title：5-40 个字符。
- titleOptions：3-10 个标题，每个 5-40 个字符。
- coverTextOptions：2-6 个封面文案，每个 2-24 个字符。
- pages：3-20 页；每页必须包含 pageNumber（正整数）、heading（1-50 字符）、body（10-1200 字符）、visualSuggestion（2-500 字符）。
- bodyText：100-10000 个字符，必须是可直接发布的完整正文。
- tags：3-15 个标签；interactionEnding：5-500 个字符；riskNotes：0-10 条。
下面仅为 JSON 形状示例。必须替换所有示例内容，不得照抄：
{
  "title": "这是一个符合长度要求的示例标题",
  "titleOptions": ["第一个完整示例标题", "第二个完整示例标题", "第三个完整示例标题"],
  "coverTextOptions": ["示例封面一", "示例封面二"],
  "pages": [
    {"pageNumber": 1, "heading": "第一页标题", "body": "第一页正文至少需要十个字符并表达完整信息。", "visualSuggestion": "清晰描述画面主体和排版"},
    {"pageNumber": 2, "heading": "第二页标题", "body": "第二页正文至少需要十个字符并承接上一页。", "visualSuggestion": "使用与内容对应的真实场景"},
    {"pageNumber": 3, "heading": "第三页标题", "body": "第三页正文至少需要十个字符并完成观点收束。", "visualSuggestion": "突出结论和互动提示"}
  ],
  "bodyText": "这是一段用于展示字段长度和 JSON 形状的完整示例正文。实际生成时必须结合用户主题重新创作，提供具体、连贯、可执行的信息，并确保正文总长度不少于一百个字符。不要复制这段示例，也不要省略页面结构、标签、互动结尾或风险提示等必需字段。",
  "tags": ["示例标签一", "示例标签二", "示例标签三"],
  "interactionEnding": "请结合实际主题生成自然的互动结尾。",
  "riskNotes": []
}`;

export const youtubeVideoPackageSchema = z.object({
  title: z.string().min(5).max(100),
  titleOptions: z.array(z.string().min(5).max(100)).min(3).max(8),
  thumbnailText: z.string().min(2).max(40),
  hook: z.string().min(5).max(1000),
  durationSec: z.number().int().min(60).max(7200),
  sections: z
    .array(
      z.object({
        startSec: z.number().int().min(0),
        endSec: z.number().int().positive(),
        heading: z.string().min(1).max(120),
        narration: z.string().min(1).max(8000),
        visualDirection: z.string().min(1).max(1500),
      }),
    )
    .min(2)
    .max(80),
  chapters: z
    .array(
      z.object({ timeSec: z.number().int().min(0), title: z.string().min(1).max(100) }),
    )
    .min(2)
    .max(50),
  description: z.string().min(20).max(5000),
  tags: z.array(z.string().min(1).max(100)).min(3).max(30),
  callToAction: z.string().min(2).max(500),
  riskNotes: riskNotesSchema,
});

const shortVideoShotSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().positive(),
  voiceover: z.string().min(1).max(1000),
  visual: z.string().min(1).max(1000),
  onScreenText: z.string().min(1).max(500),
  camera: z.string().min(1).max(300),
  transition: z.string().min(1).max(300),
});

export const tiktokShortVideoScriptSchema = z.object({
  title: z.string().min(3).max(90),
  hook: z.string().min(3).max(500),
  durationSec: z.number().int().min(5).max(600),
  shots: z.array(shortVideoShotSchema).min(2).max(100),
  caption: z.string().min(10).max(2200),
  hashtags: z.array(z.string().min(1).max(80)).min(3).max(15),
  musicDirection: z.string().min(2).max(500),
  callToAction: z.string().min(2).max(500),
  disclosureNotes: z.array(z.string().max(500)).max(8).default([]),
  riskNotes: riskNotesSchema,
});

export const instagramCarouselSchema = z.object({
  title: z.string().min(3).max(100),
  coverText: z.string().min(2).max(80),
  slides: z
    .array(
      z.object({
        slideNumber: z.number().int().positive(),
        heading: z.string().min(1).max(100),
        body: z.string().min(5).max(1200),
        visualDirection: z.string().min(2).max(700),
        altText: z.string().min(2).max(1000),
      }),
    )
    .min(2)
    .max(10),
  caption: z.string().min(20).max(2200),
  hashtags: z.array(z.string().min(1).max(80)).min(3).max(30),
  callToAction: z.string().min(2).max(500),
  riskNotes: riskNotesSchema,
});

export const xThreadSchema = z.object({
  title: z.string().min(3).max(120),
  posts: z
    .array(
      z.object({
        index: z.number().int().positive(),
        text: z.string().min(1).max(280),
        mediaSuggestion: z.string().max(500).default(""),
      }),
    )
    .min(1)
    .max(12),
  callToAction: z.string().min(1).max(280),
  riskNotes: riskNotesSchema,
});

export const redditPostSchema = z.object({
  title: z.string().min(3).max(300),
  audience: z.string().min(2).max(300),
  subredditSuggestions: z.array(z.string().min(2).max(100)).min(1).max(5),
  bodyMarkdown: z.string().min(50).max(40000),
  tldr: z.string().min(5).max(1000),
  discussionPrompt: z.string().min(3).max(1000),
  flairSuggestion: z.string().max(100).default(""),
  disclosure: z.string().max(1000).default(""),
  riskNotes: riskNotesSchema,
});

export type PlatformPromptContext = {
  idea: unknown;
  persona: unknown;
  styleProfile: unknown;
  references: unknown[];
};

export type PlatformPromptInput = {
  context: PlatformPromptContext;
  targetLocale: ContentLocale;
  uiLocale: UiLocale;
  skillInstruction?: string;
};

export type NormalizedGeneratedContent = {
  title: string;
  bodyText: string;
  fullMarkdown: string;
  tags: string[];
  riskNotes: string[];
};

export type PlatformServerDefinition = {
  platform: PlatformId;
  contentKind: ContentKindId;
  schema: z.ZodTypeAny;
  promptVersion: string;
  buildPrompt(input: PlatformPromptInput): { system: string; prompt: string };
  normalize(output: unknown): NormalizedGeneratedContent;
  buildAssetChecklist(locale: UiLocale): string;
};

function languageInstruction(targetLocale: ContentLocale, uiLocale: UiLocale): string {
  const target = CONTENT_LOCALE_LABELS[targetLocale].en;
  const notes = uiLocale === "en-US" ? "English" : "Simplified Chinese";
  return `All publishable fields must be written in ${target}. Risk notes and creator-only operational notes must be written in ${notes}. Preserve JSON field names exactly.`;
}

function buildSystem(
  params: PlatformPromptInput,
  role: string,
  fields: string,
  outputContract?: string,
): string {
  return [
    role,
    "Create original work. Never impersonate a referenced creator and never copy source wording.",
    REFERENCE_GUARD_INSTRUCTION,
    languageInstruction(params.targetLocale, params.uiLocale),
    `Return JSON only with these fields: ${fields}.`,
    outputContract,
    params.skillInstruction ?? "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function contextPrompt(input: PlatformPromptInput, request: string): string {
  return `${JSON.stringify(input.context, null, 2)}\n\n${request}`;
}

function tagsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function risksOf(value: unknown): string[] {
  return tagsOf(value);
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

const definitions: Record<ContentKindId, PlatformServerDefinition> = {
  xhs_graphic: {
    platform: "xiaohongshu",
    contentKind: "xhs_graphic",
    schema: xhsGraphicOutputSchema,
    promptVersion: "content-xhs-v2-registry",
    buildPrompt(input) {
      return {
        system: buildSystem(
          input,
          "You are an expert Xiaohongshu graphic-post editor.",
          "title, titleOptions, coverTextOptions, pages, bodyText, tags, interactionEnding, riskNotes",
          XHS_OUTPUT_CONTRACT,
        ),
        prompt: contextPrompt(input, "Create a complete Xiaohongshu graphic post with page-by-page structure."),
      };
    },
    normalize(output) {
      const value = xhsGraphicOutputSchema.parse(output);
      return {
        title: value.title,
        bodyText: value.bodyText,
        fullMarkdown: toXhsMarkdown(value),
        tags: value.tags,
        riskNotes: value.riskNotes,
      };
    },
    buildAssetChecklist(locale) {
      return locale === "en-US"
        ? "# Asset checklist\n\n- 1–18 portrait images\n- The first image is the cover\n- Review title, body and hashtags before publishing"
        : "# 素材清单\n\n- 1–18 张竖版图片\n- 首图作为封面\n- 发布前复核标题、正文和标签";
    },
  },
  douyin_video_script: {
    platform: "douyin",
    contentKind: "douyin_video_script",
    schema: douyinVideoScriptOutputSchema,
    promptVersion: "content-douyin-v2-registry",
    buildPrompt(input) {
      return {
        system: buildSystem(
          input,
          "You are an expert Douyin short-video director. Shot timing must be continuous.",
          "title, hook, durationSec, shots, caption, tags, riskNotes",
        ),
        prompt: contextPrompt(input, "Create a 10–180 second short-video script with continuous shot timing."),
      };
    },
    normalize(output) {
      const value = douyinVideoScriptOutputSchema.parse(output);
      return {
        title: value.title,
        bodyText: value.caption,
        fullMarkdown: toDouyinMarkdown(value),
        tags: value.tags,
        riskNotes: value.riskNotes,
      };
    },
    buildAssetChecklist(locale) {
      return locale === "en-US"
        ? "# Asset checklist\n\n- One finished vertical video\n- Verify subtitles, music rights and disclosure\n- Final confirmation may be required in Douyin"
        : "# 素材清单\n\n- 一个竖版成片视频\n- 复核字幕、音乐版权与披露信息\n- 可能需要在抖音内最终确认";
    },
  },
  youtube_video_package: {
    platform: "youtube",
    contentKind: "youtube_video_package",
    schema: youtubeVideoPackageSchema,
    promptVersion: "content-youtube-v1",
    buildPrompt(input) {
      return {
        system: buildSystem(
          input,
          "You are a YouTube video strategist and script editor.",
          "title, titleOptions, thumbnailText, hook, durationSec, sections, chapters, description, tags, callToAction, riskNotes",
        ),
        prompt: contextPrompt(input, "Create a production-ready YouTube video package with coherent chapters and visual direction."),
      };
    },
    normalize(output) {
      const value = youtubeVideoPackageSchema.parse(output);
      const sections = value.sections.map(
        (section) =>
          `## ${timecode(section.startSec)}–${timecode(section.endSec)} ${section.heading}\n\n${section.narration}\n\n**Visual:** ${section.visualDirection}`,
      );
      const chapters = value.chapters
        .map((chapter) => `${timecode(chapter.timeSec)} ${chapter.title}`)
        .join("\n");
      return {
        title: value.title,
        bodyText: value.description,
        fullMarkdown: [
          `# ${value.title}`,
          `**Thumbnail:** ${value.thumbnailText}`,
          `**Hook:** ${value.hook}`,
          ...sections,
          `## Chapters\n\n${chapters}`,
          `## Description\n\n${value.description}`,
          `## Tags\n\n${value.tags.join(", ")}`,
          `## CTA\n\n${value.callToAction}`,
        ].join("\n\n"),
        tags: value.tags,
        riskNotes: value.riskNotes,
      };
    },
    buildAssetChecklist(locale) {
      return locale === "en-US"
        ? "# Asset checklist\n\n- Finished 16:9 video\n- 1280×720 thumbnail without misleading claims\n- Captions/subtitles\n- Licensed music and footage\n- Review title (≤100 characters) and description (≤5000 bytes)"
        : "# 素材清单\n\n- 16:9 成片视频\n- 1280×720 缩略图，避免误导性表述\n- 字幕文件\n- 已获授权的音乐与画面\n- 复核标题（≤100字符）和简介（≤5000字节）";
    },
  },
  tiktok_short_video_script: {
    platform: "tiktok",
    contentKind: "tiktok_short_video_script",
    schema: tiktokShortVideoScriptSchema,
    promptVersion: "content-tiktok-v1",
    buildPrompt(input) {
      return {
        system: buildSystem(
          input,
          "You are a TikTok short-video director focused on original, creator-led content.",
          "title, hook, durationSec, shots, caption, hashtags, musicDirection, callToAction, disclosureNotes, riskNotes",
        ),
        prompt: contextPrompt(input, "Create a concise vertical-video script with a strong opening and continuous shots."),
      };
    },
    normalize(output) {
      const value = tiktokShortVideoScriptSchema.parse(output);
      const rows = value.shots.map(
        (shot) =>
          `| ${shot.startSec}-${shot.endSec}s | ${tableCell(shot.voiceover)} | ${tableCell(shot.visual)} | ${tableCell(shot.onScreenText)} | ${tableCell(shot.camera)} | ${tableCell(shot.transition)} |`,
      );
      return {
        title: value.title,
        bodyText: value.caption,
        fullMarkdown: [
          `# ${value.title}`,
          `**Hook:** ${value.hook}`,
          "| Time | Voiceover | Visual | On-screen text | Camera | Transition |",
          "| --- | --- | --- | --- | --- | --- |",
          ...rows,
          `## Caption\n\n${value.caption}`,
          `## Hashtags\n\n${value.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}`,
          `## Music\n\n${value.musicDirection}`,
          `## CTA\n\n${value.callToAction}`,
        ].join("\n\n"),
        tags: value.hashtags,
        riskNotes: [...value.disclosureNotes, ...value.riskNotes],
      };
    },
    buildAssetChecklist(locale) {
      return locale === "en-US"
        ? "# Asset checklist\n\n- Finished 9:16 video\n- Burned-in or uploaded captions\n- Licensed sound/music\n- Confirm AI-generated and commercial-content disclosures\n- Publish manually; no TikTok account is connected"
        : "# 素材清单\n\n- 9:16 成片视频\n- 内嵌或单独上传的字幕\n- 已获授权的音乐/声音\n- 确认 AI 生成及商业内容披露\n- 当前未连接 TikTok 账号，请手动发布";
    },
  },
  instagram_carousel: {
    platform: "instagram",
    contentKind: "instagram_carousel",
    schema: instagramCarouselSchema,
    promptVersion: "content-instagram-v1",
    buildPrompt(input) {
      return {
        system: buildSystem(
          input,
          "You are an Instagram carousel editor with strong visual storytelling and accessibility practice.",
          "title, coverText, slides, caption, hashtags, callToAction, riskNotes",
        ),
        prompt: contextPrompt(input, "Create a 2–10 slide carousel with useful alt text and a cohesive caption."),
      };
    },
    normalize(output) {
      const value = instagramCarouselSchema.parse(output);
      const slides = value.slides.map(
        (slide) =>
          `## Slide ${slide.slideNumber}: ${slide.heading}\n\n${slide.body}\n\n**Visual:** ${slide.visualDirection}\n\n**Alt text:** ${slide.altText}`,
      );
      return {
        title: value.title,
        bodyText: value.caption,
        fullMarkdown: [
          `# ${value.title}`,
          `**Cover:** ${value.coverText}`,
          ...slides,
          `## Caption\n\n${value.caption}`,
          `## Hashtags\n\n${value.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}`,
          `## CTA\n\n${value.callToAction}`,
        ].join("\n\n"),
        tags: value.hashtags,
        riskNotes: value.riskNotes,
      };
    },
    buildAssetChecklist(locale) {
      return locale === "en-US"
        ? "# Asset checklist\n\n- 2–10 images in a consistent 4:5 or 1:1 ratio\n- Cover image\n- Alt text for every slide\n- Review caption, hashtags and rights\n- Publish manually; no Instagram account is connected"
        : "# 素材清单\n\n- 2–10 张比例一致的 4:5 或 1:1 图片\n- 轮播封面\n- 每页 Alt Text\n- 复核 Caption、Hashtag 与素材权利\n- 当前未连接 Instagram 账号，请手动发布";
    },
  },
  x_thread: {
    platform: "x",
    contentKind: "x_thread",
    schema: xThreadSchema,
    promptVersion: "content-x-v1",
    buildPrompt(input) {
      return {
        system: buildSystem(
          input,
          "You are an X thread editor. Keep each post self-contained and within 280 characters.",
          "title, posts, callToAction, riskNotes",
        ),
        prompt: contextPrompt(input, "Create a coherent 1–12 post thread. Do not rely on premium long-form posts."),
      };
    },
    normalize(output) {
      const value = xThreadSchema.parse(output);
      return {
        title: value.title,
        bodyText: value.posts.map((post) => `${post.index}. ${post.text}`).join("\n\n"),
        fullMarkdown: [
          `# ${value.title}`,
          ...value.posts.map(
            (post) =>
              `## ${post.index}/${value.posts.length}\n\n${post.text}${post.mediaSuggestion ? `\n\n**Media:** ${post.mediaSuggestion}` : ""}`,
          ),
          `## CTA\n\n${value.callToAction}`,
        ].join("\n\n"),
        tags: [],
        riskNotes: value.riskNotes,
      };
    },
    buildAssetChecklist(locale) {
      return locale === "en-US"
        ? "# Asset checklist\n\n- Review every post at ≤280 characters\n- Prepare only media you have rights to use\n- Verify links and mentions\n- Publish the thread manually; no X account is connected"
        : "# 素材清单\n\n- 逐条复核，每条不超过 280 字符\n- 仅准备拥有使用权的媒体素材\n- 检查链接和提及账号\n- 当前未连接 X 账号，请手动发布线程";
    },
  },
  reddit_post: {
    platform: "reddit",
    contentKind: "reddit_post",
    schema: redditPostSchema,
    promptVersion: "content-reddit-v1",
    buildPrompt(input) {
      return {
        system: buildSystem(
          input,
          "You are a Reddit community-post editor. Be transparent, non-promotional and community-specific.",
          "title, audience, subredditSuggestions, bodyMarkdown, tldr, discussionPrompt, flairSuggestion, disclosure, riskNotes",
        ),
        prompt: contextPrompt(input, "Create a useful discussion post. Do not fabricate subreddit rules; mark suggestions for manual review."),
      };
    },
    normalize(output) {
      const value = redditPostSchema.parse(output);
      return {
        title: value.title,
        bodyText: value.bodyMarkdown,
        fullMarkdown: [
          `# ${value.title}`,
          `**Audience:** ${value.audience}`,
          `**Suggested communities (verify rules manually):** ${value.subredditSuggestions.join(", ")}`,
          value.bodyMarkdown,
          `## TL;DR\n\n${value.tldr}`,
          `## Discussion prompt\n\n${value.discussionPrompt}`,
          value.flairSuggestion ? `**Suggested flair:** ${value.flairSuggestion}` : "",
          value.disclosure ? `**Disclosure:** ${value.disclosure}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        tags: value.subredditSuggestions,
        riskNotes: value.riskNotes,
      };
    },
    buildAssetChecklist(locale) {
      return locale === "en-US"
        ? "# Asset checklist\n\n- Read the target community rules before posting\n- Verify the suggested flair and disclosure\n- Remove unsupported promotional claims\n- Use only media and quotations you have rights to use\n- Publish manually; no Reddit account is connected"
        : "# 素材清单\n\n- 发布前阅读目标社区规则\n- 核对 Flair 与披露说明\n- 删除无依据的营销表述\n- 仅使用拥有权利的媒体和引用\n- 当前未连接 Reddit 账号，请手动发布";
    },
  },
};

for (const definition of Object.values(definitions)) {
  const shared = PLATFORM_DEFINITIONS[definition.platform];
  if (shared.contentKind !== definition.contentKind) {
    throw new Error(`Platform registry mismatch: ${definition.platform}`);
  }
}

export function getPlatformServerDefinition(
  contentKind: ContentKindId,
): PlatformServerDefinition {
  return definitions[contentKind];
}

export function getPlatformServerDefinitionByPlatform(
  platform: PlatformId,
): PlatformServerDefinition {
  return definitions[PLATFORM_DEFINITIONS[platform].contentKind];
}

export function parsePlatformOutput(contentKind: ContentKindId, value: unknown): unknown {
  return getPlatformServerDefinition(contentKind).schema.parse(value);
}

export function platformAssetChecklist(platform: PlatformId, locale: UiLocale): string {
  return getPlatformServerDefinitionByPlatform(platform).buildAssetChecklist(locale);
}

export function riskNotesFromOutput(contentKind: ContentKindId, output: unknown): string[] {
  const normalized = getPlatformServerDefinition(contentKind).normalize(output);
  return risksOf(normalized.riskNotes);
}
