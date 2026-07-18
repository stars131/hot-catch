/**
 * 复盘数学基础：预测 vs 实际的偏差计算与"连续三次同方向误判"守卫。
 * 纯函数、无 IO：metrics-handler 与单元测试共用，保证规则判定不漂移。
 */

export type OutcomeMetrics = {
  viewCount?: number | null;
  likeCount?: number | null;
  collectCount?: number | null;
  commentCount?: number | null;
  shareCount?: number | null;
};

export type VarianceDirection = "underestimated" | "overestimated" | "aligned";

export type OutcomeComparison = {
  predictedTotal: number;
  outcomeScore: number;
  delta: number;
  direction: VarianceDirection;
};

/** 与发布前评分同尺度（0-100）的互动结果分：加权互动 / 播放。 */
export function computeOutcome(
  metrics: OutcomeMetrics,
  predictedTotal: number,
): OutcomeComparison {
  const engagement =
    (metrics.likeCount ?? 0) * 2 +
    (metrics.collectCount ?? 0) * 3 +
    (metrics.commentCount ?? 0) * 3 +
    (metrics.shareCount ?? 0) * 4;
  const views = Math.max(metrics.viewCount ?? 0, 1);
  const outcomeScore = Math.min(100, Math.round((engagement / views) * 1000));
  const delta = outcomeScore - predictedTotal;
  const direction: VarianceDirection =
    delta > 10 ? "underestimated" : delta < -10 ? "overestimated" : "aligned";
  return { predictedTotal, outcomeScore, delta, direction };
}

/**
 * 规则候选守卫：必须恰好连续 3 次同一个非 aligned 方向才允许产生候选建议。
 * 候选永远不会自动启用：还需回测和用户明确确认。
 */
export function shouldProposeRule(directions: readonly string[]): boolean {
  if (directions.length !== 3) return false;
  const [first] = directions;
  if (first !== "underestimated" && first !== "overestimated") return false;
  return directions.every((direction) => direction === first);
}
