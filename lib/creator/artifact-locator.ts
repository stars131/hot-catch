/**
 * 评分警告 → 内容块定位映射。
 *
 * 评分维度 key 来自 lib/scoring/score.ts(hook/value/structure/...),
 * Artifact 面板据此把警告定位到「内容」或「结构」标签下的具体块。
 * 块通过 data-artifact-block 属性锚定,详见 artifact-panel。
 */

export type ArtifactEditorTab = "content" | "structure" | "score";

export type ArtifactBlockId =
  | "title"
  | "body"
  | "structure"
  | "interaction"
  | "risk";

export type ScoreTarget = {
  tab: Exclude<ArtifactEditorTab, "score">;
  blockId: ArtifactBlockId;
  hint: string;
};

const XHS_TARGETS: Record<string, ScoreTarget> = {
  hook: { tab: "content", blockId: "title", hint: "标题与封面候选" },
  value: { tab: "content", blockId: "body", hint: "完整正文" },
  structure: { tab: "structure", blockId: "structure", hint: "分页结构" },
  visual: { tab: "structure", blockId: "structure", hint: "每页视觉建议" },
  interaction: { tab: "content", blockId: "interaction", hint: "互动收尾与标签" },
  safety: { tab: "content", blockId: "risk", hint: "风险说明" },
};

const DOUYIN_TARGETS: Record<string, ScoreTarget> = {
  hook: { tab: "structure", blockId: "structure", hint: "开场分镜" },
  value: { tab: "content", blockId: "body", hint: "发布文案与标签" },
  timeline: { tab: "structure", blockId: "structure", hint: "分镜时间轴" },
  visual: { tab: "structure", blockId: "structure", hint: "画面与镜头指令" },
  audio: { tab: "structure", blockId: "structure", hint: "口播与音乐" },
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
