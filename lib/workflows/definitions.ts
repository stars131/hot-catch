import { JobType, type ScheduledWorkflowType } from "@prisma/client";

export const WORKFLOW_DEFINITIONS: Record<ScheduledWorkflowType, {
  label: string;
  jobType: JobType;
  description: string;
}> = {
  hotspot_refresh: { label: "热点刷新", jobType: "ingest", description: "更新当前热点候选，不触发发布。" },
  research_digest: { label: "研究摘要", jobType: "analysis", description: "把已保存参考整理为研究摘要。" },
  draft_generation: { label: "定时生成草稿", jobType: "analysis", description: "只创建草稿，不允许自动发布。" },
  metrics_collection: { label: "指标采集", jobType: "metrics", description: "采集已跟踪作品指标。" },
  retrospective_prepare: { label: "复盘准备", jobType: "analysis", description: "整理复盘材料与差异。" },
};
