import type { PatchCard } from "@/lib/creator/chat-protocol";

/**
 * content.propose_patch 协议基础(C7)。
 *
 * 职责:
 * 1. 从修订版本(title/bodyText/structuredContent)中读取指定区块的当前文本;
 * 2. 以 immutable 方式把「before → after」替换应用回版本载荷;
 * 3. 区块支持范围与 patch 卡 schema 保持一致。
 *
 * 该模块是纯函数,服务端(提案生成、应用校验)与客户端
 * (「复制到编辑器」写入草稿)共用同一份读取/应用逻辑,
 * 保证预览与实际落库结果一致。
 */

export type PatchSection = PatchCard["section"];

export type PatchableRevision = {
  title: string | null;
  bodyText: string | null;
  structuredContent: unknown;
};

export type PatchableDraft = {
  title: string;
  body: string;
  structured: Record<string, unknown> | null;
};

export const PATCHABLE_SECTION_KINDS = [
  "title",
  "body",
  "hook",
  "interaction",
  "page",
  "shot",
] as const;

const SECTION_LABEL: Record<string, string> = {
  title: "标题",
  body: "正文",
  hook: "开场钩子",
  interaction: "互动收尾",
};

export function patchSectionLabel(
  contentKind: "xhs_graphic" | "douyin_video_script",
  section: PatchSection,
): string {
  if (section.kind === "page") return `第 ${(section.index ?? 0) + 1} 页`;
  if (section.kind === "shot") return `第 ${(section.index ?? 0) + 1} 镜`;
  if (section.kind === "body") {
    return contentKind === "douyin_video_script" ? "发布文案" : "完整正文";
  }
  return SECTION_LABEL[section.kind] ?? section.kind;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => asRecord(item) ?? {}) : [];
}

function draftOfRevision(revision: PatchableRevision): PatchableDraft {
  return {
    title: revision.title ?? "",
    body: revision.bodyText ?? "",
    structured: asRecord(revision.structuredContent),
  };
}

/**
 * 读取区块当前文本;区块不存在(如下标越界、无结构化数据)返回 null。
 * 分页取 pages[i].body,分镜取 shots[i].voiceover(口播是分镜的主文本)。
 */
export function readSectionText(
  draft: PatchableDraft,
  section: PatchSection,
): string | null {
  switch (section.kind) {
    case "title":
      return draft.title;
    case "body":
      return draft.body;
    case "hook":
      return draft.structured ? stringOf(draft.structured.hook) : null;
    case "interaction":
      return draft.structured ? stringOf(draft.structured.interactionEnding) : null;
    case "page": {
      const pages = recordArray(draft.structured?.pages);
      const page = pages[section.index ?? -1];
      return page ? stringOf(page.body) : null;
    }
    case "shot": {
      const shots = recordArray(draft.structured?.shots);
      const shot = shots[section.index ?? -1];
      return shot ? stringOf(shot.voiceover) : null;
    }
    default:
      return null;
  }
}

export function readRevisionSectionText(
  revision: PatchableRevision,
  section: PatchSection,
): string | null {
  return readSectionText(draftOfRevision(revision), section);
}

/**
 * 把「before → after」应用到草稿的指定区块,返回新草稿;原对象不被修改。
 * before 为空字符串表示整块替换;否则只替换第一处精确匹配。
 * 区块文本已变化、找不到 before 时返回 null,调用方必须显式处理,不允许静默覆盖。
 */
export function applySectionPatch(
  draft: PatchableDraft,
  section: PatchSection,
  before: string,
  after: string,
): PatchableDraft | null {
  const current = readSectionText(draft, section);
  if (current === null) return null;
  let next: string;
  if (before === "" || before === current) {
    next = after;
  } else if (current.includes(before)) {
    next = current.replace(before, after);
  } else {
    return null;
  }

  switch (section.kind) {
    case "title":
      return {
        ...draft,
        title: next,
        structured: draft.structured ? { ...draft.structured, title: next } : draft.structured,
      };
    case "body":
      return { ...draft, body: next };
    case "hook":
      if (!draft.structured) return null;
      return { ...draft, structured: { ...draft.structured, hook: next } };
    case "interaction":
      if (!draft.structured) return null;
      return { ...draft, structured: { ...draft.structured, interactionEnding: next } };
    case "page": {
      if (!draft.structured) return null;
      const pages = recordArray(draft.structured.pages);
      const index = section.index ?? -1;
      if (!pages[index]) return null;
      const nextPages = pages.map((page, i) => (i === index ? { ...page, body: next } : page));
      return { ...draft, structured: { ...draft.structured, pages: nextPages } };
    }
    case "shot": {
      if (!draft.structured) return null;
      const shots = recordArray(draft.structured.shots);
      const index = section.index ?? -1;
      if (!shots[index]) return null;
      const nextShots = shots.map((shot, i) =>
        i === index ? { ...shot, voiceover: next } : shot,
      );
      return { ...draft, structured: { ...draft.structured, shots: nextShots } };
    }
    default:
      return null;
  }
}

export function applyRevisionSectionPatch(
  revision: PatchableRevision,
  section: PatchSection,
  before: string,
  after: string,
): PatchableDraft | null {
  return applySectionPatch(draftOfRevision(revision), section, before, after);
}

const EXCERPT_MAX = 2000;

/**
 * 确定提案作用范围:摘录能在区块内精确匹配时只改摘录,否则改整块。
 * 返回的 before 会作为应用时的一致性校验依据。
 */
export function resolvePatchScope(sectionText: string, excerpt?: string): string {
  const trimmed = (excerpt ?? "").trim();
  if (trimmed && trimmed.length <= EXCERPT_MAX && sectionText.includes(trimmed)) {
    return trimmed;
  }
  return sectionText.slice(0, EXCERPT_MAX);
}
