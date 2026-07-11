/**
 * Artifact 内容块定位与「选中块让星迹修改」协议。
 *
 * 1. 评分警告 → 内容块定位:
 *    评分维度 key 来自 lib/scoring/score.ts(hook/value/structure/...),
 *    Artifact 面板据此把警告定位到「内容」或「结构」标签下的具体块。
 *    C6 起结构字段在「内容」标签直接可编辑,警告统一定位到可修改的位置。
 * 2. 区块引用(ArtifactSectionRef):
 *    从编辑器发起「让星迹修改」时,用稳定的区块引用生成对话指令,
 *    只携带区块种类、下标与摘录,不携带 API 地址或可执行内容;
 *    未来接 content.propose_patch 卡片或外接 Skill 时复用同一引用形状。
 *
 * 块通过 data-artifact-block 属性锚定,详见 artifact-panel。
 */

export type ArtifactEditorTab = "content" | "structure" | "score";

export type ArtifactBlockId =
  | "title"
  | "cover"
  | "pages"
  | "body"
  | "interaction"
  | "tags"
  | "risk"
  | "hook"
  | "shots"
  | "structure";

export type ScoreTarget = {
  tab: Exclude<ArtifactEditorTab, "score">;
  blockId: ArtifactBlockId;
  hint: string;
};

const XHS_TARGETS: Record<string, ScoreTarget> = {
  hook: { tab: "content", blockId: "title", hint: "标题与封面候选" },
  value: { tab: "content", blockId: "body", hint: "完整正文" },
  structure: { tab: "content", blockId: "pages", hint: "分页结构" },
  visual: { tab: "content", blockId: "pages", hint: "每页视觉建议" },
  interaction: { tab: "content", blockId: "interaction", hint: "互动收尾与标签" },
  safety: { tab: "content", blockId: "risk", hint: "风险说明" },
};

const DOUYIN_TARGETS: Record<string, ScoreTarget> = {
  hook: { tab: "content", blockId: "hook", hint: "开场钩子与首镜" },
  value: { tab: "content", blockId: "body", hint: "发布文案与标签" },
  timeline: { tab: "content", blockId: "shots", hint: "分镜时间轴" },
  visual: { tab: "content", blockId: "shots", hint: "画面与镜头指令" },
  audio: { tab: "content", blockId: "shots", hint: "口播与音乐" },
  safety: { tab: "content", blockId: "risk", hint: "风险说明" },
};

export function scoreTargetOf(
  contentKind: "xhs_graphic" | "douyin_video_script",
  dimensionKey: string,
): ScoreTarget | null {
  const table = contentKind === "xhs_graphic" ? XHS_TARGETS : DOUYIN_TARGETS;
  return Object.prototype.hasOwnProperty.call(table, dimensionKey)
    ? table[dimensionKey]
    : null;
}

/** data-artifact-block 属性值;定位时按此查询并滚动高亮。 */
export function artifactBlockAnchor(blockId: ArtifactBlockId): string {
  return `artifact-block-${blockId}`;
}

/** 分页/分镜等重复块的条目级锚点(index 从 0 起)。 */
export function artifactItemAnchor(blockId: "pages" | "shots", index: number): string {
  return `artifact-block-${blockId}-${index + 1}`;
}

// ---------------------------------------------------------------------------
// 「让星迹修改」区块引用协议
// ---------------------------------------------------------------------------

export type ArtifactSectionRef =
  | { kind: "title" }
  | { kind: "cover" }
  | { kind: "body" }
  | { kind: "interaction" }
  | { kind: "tags" }
  | { kind: "risk" }
  | { kind: "hook" }
  | { kind: "page"; index: number }
  | { kind: "shot"; index: number };

const SECTION_BASE_LABEL: Record<ArtifactSectionRef["kind"], string> = {
  title: "标题",
  cover: "封面文案",
  body: "完整正文",
  interaction: "互动收尾",
  tags: "标签",
  risk: "风险说明",
  hook: "开场钩子",
  page: "分页",
  shot: "分镜",
};

/**
 * 区块的用户可读名称。
 * detail 为可选的上下文(页面小标题、分镜时间段等),由编辑器就近提供。
 */
export function artifactSectionLabel(
  contentKind: "xhs_graphic" | "douyin_video_script",
  section: ArtifactSectionRef,
  detail?: string,
): string {
  if (section.kind === "page") {
    const base = `第 ${section.index + 1} 页`;
    return detail ? `${base}「${detail}」` : base;
  }
  if (section.kind === "shot") {
    const base = `第 ${section.index + 1} 镜`;
    return detail ? `${base}(${detail})` : base;
  }
  if (section.kind === "body" && contentKind === "douyin_video_script") {
    return "发布文案";
  }
  return SECTION_BASE_LABEL[section.kind];
}

const EXCERPT_MAX_LENGTH = 80;

/**
 * 生成预填到 Composer 的修改指令。
 * 指令是稳定的自然语言前缀,以冒号结尾等待用户补全诉求;
 * 携带版本号与(可选)选中文本摘录,便于服务端 Agent 精确定位。
 */
export function buildSectionRefinePrompt(params: {
  contentKind: "xhs_graphic" | "douyin_video_script";
  section: ArtifactSectionRef;
  revisionNumber?: number | null;
  detail?: string;
  excerpt?: string;
}): string {
  const label = artifactSectionLabel(params.contentKind, params.section, params.detail);
  const version =
    typeof params.revisionNumber === "number" ? `(当前 v${params.revisionNumber})` : "";
  const excerpt = normalizeExcerpt(params.excerpt);
  if (excerpt) {
    return `请修改${label}${version}中选中的这段:「${excerpt}」,`;
  }
  return `请修改${label}${version}:`;
}

function normalizeExcerpt(value: string | undefined): string {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.length > EXCERPT_MAX_LENGTH
    ? `${trimmed.slice(0, EXCERPT_MAX_LENGTH)}…`
    : trimmed;
}

/**
 * 把编辑器区块引用映射为 content.propose_patch 的目标区块。
 * cover/tags/risk 是列表或选项型字段,暂不支持补丁提案,返回 null,
 * 调用方回退为普通对话预填。
 */
export function patchSectionOf(
  section: ArtifactSectionRef,
): { kind: "title" | "body" | "hook" | "interaction" | "page" | "shot"; index?: number } | null {
  switch (section.kind) {
    case "title":
    case "body":
    case "hook":
    case "interaction":
      return { kind: section.kind };
    case "page":
      return { kind: "page", index: section.index };
    case "shot":
      return { kind: "shot", index: section.index };
    default:
      return null;
  }
}
