import { Prisma } from "@prisma/client";
import { registerJobHandler } from "@/lib/jobs/handlers";
import type { JobHandler } from "@/lib/jobs/types";
import { prisma } from "@/lib/prisma";
import { PLATFORM_DEFINITIONS, isPlatformId } from "@/lib/platforms/registry";

const workflowHandler: JobHandler = async (payload, reportProgress) => {
  const input = payload.input as { workflowId?: string };
  if (!input.workflowId) throw new Error("workflowId is required");
  const workflow = await prisma.scheduledWorkflow.findFirst({
    where: { id: input.workflowId, userId: payload.userId, status: "active" },
  });
  if (!workflow) return { output: { skipped: true, reason: "workflow_inactive" } };
  const slot = new Date().toISOString().slice(0, 16);
  const run = await prisma.workflowRun.upsert({
    where: { scheduledWorkflowId_idempotencyKey: { scheduledWorkflowId: workflow.id, idempotencyKey: slot } },
    update: {},
    create: { userId: workflow.userId, scheduledWorkflowId: workflow.id, idempotencyKey: slot, input: workflow.config === null ? Prisma.JsonNull : workflow.config as Prisma.InputJsonValue, status: "running", startedAt: new Date(), processingJobId: payload.databaseJobId },
  });
  if (run.status === "succeeded") return { output: run.output ?? { replayed: true } };
  await reportProgress(30, "执行白名单计划任务");
  const output = await executeWorkflow(workflow);
  await prisma.$transaction([
    prisma.workflowRun.update({ where: { id: run.id }, data: { status: "succeeded", output, completedAt: new Date() } }),
    prisma.scheduledWorkflow.update({ where: { id: workflow.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } }),
  ]);
  await reportProgress(100, "完成");
  return { resultType: "workflowRun", resultId: run.id, output };
};

registerJobHandler("workflow.dispatch", workflowHandler);

async function executeWorkflow(workflow: { id: string; userId: string; type: string; socialConnectionId: string | null; config: Prisma.JsonValue }) {
  const config = asRecord(workflow.config);
  if (workflow.type === "draft_generation") {
    const platform = isPlatformId(config.platform) ? config.platform : "xiaohongshu";
    const definition = PLATFORM_DEFINITIONS[platform];
    const brief = typeof config.brief === "string" ? config.brief : "计划创作草稿";
    const content = await prisma.generatedContent.create({
      data: {
        userId: workflow.userId,
        targetSocialConnectionId: workflow.socialConnectionId,
        platform,
        contentKind: definition.contentKind,
        contentLocale: typeof config.locale === "string" ? config.locale : "zh-CN",
        title: brief.slice(0, 120),
        inputType: "draft",
        inputText: brief,
        outputType: definition.contentKind,
        status: "draft",
        contextSnapshot: { scheduledWorkflowId: workflow.id, autoPublish: false },
      },
    });
    return { contentId: content.id, status: "draft", autoPublish: false } as Prisma.InputJsonValue;
  }
  if (workflow.type === "retrospective_prepare") {
    const records = await prisma.publishRecord.findMany({ where: { userId: workflow.userId, status: "published" }, take: 20, orderBy: { updatedAt: "desc" } });
    return { preparedRecordIds: records.map((record) => record.id) } as Prisma.InputJsonValue;
  }
  if (workflow.type === "metrics_collection") {
    const tracked = await prisma.trackedPublication.count({ where: { userId: workflow.userId, status: "active" } });
    return { trackedCount: tracked, collectionRequested: true } as Prisma.InputJsonValue;
  }
  return { type: workflow.type, preparedAt: new Date().toISOString() } as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
