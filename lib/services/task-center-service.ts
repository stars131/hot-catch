import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { cancelJob, enqueueJob } from "@/lib/jobs/queues";
import { cancelAgentRun } from "@/lib/creator/agent-service";
import { updateQueuedTurn } from "@/lib/services/queue-service";

export async function listTaskCenter(userId: string, status?: string) {
  const [runs, jobs, interactions, turns, workflowRuns] = await Promise.all([
    prisma.agentRun.findMany({
      where: { userId, ...(status ? { status: status as never } : {}) },
      orderBy: { updatedAt: "desc" }, take: 100,
    }),
    prisma.processingJob.findMany({
      where: { userId, ...(status ? { status: status as never } : {}) },
      orderBy: { updatedAt: "desc" }, take: 100,
    }),
    prisma.pendingInteraction.findMany({
      where: { userId, ...(status ? { status: status as never } : {}) },
      orderBy: { updatedAt: "desc" }, take: 100,
    }),
    prisma.queuedTurn.findMany({
      where: { userId, ...(status ? { status: status as never } : {}) },
      orderBy: { updatedAt: "desc" }, take: 100,
    }),
    prisma.workflowRun.findMany({
      where: { userId, ...(status ? { status: status as never } : {}) },
      include: { scheduledWorkflow: { select: { name: true, type: true } } },
      orderBy: { updatedAt: "desc" }, take: 100,
    }),
  ]);
  return { runs, jobs, interactions, turns, workflowRuns };
}

export async function taskCenterAction(input: {
  userId: string;
  kind: "run" | "job" | "queue";
  id: string;
  action: "cancel" | "retry";
}) {
  if (input.kind === "run") {
    if (input.action !== "cancel") throw new AppError("VALIDATION_ERROR", "运行记录只支持取消。", 422);
    return cancelAgentRun(input.userId, input.id);
  }
  if (input.kind === "queue") {
    if (input.action !== "cancel") throw new AppError("VALIDATION_ERROR", "排队消息只支持取消。", 422);
    return updateQueuedTurn({ userId: input.userId, turnId: input.id, action: "cancel" });
  }
  if (input.action === "cancel") return cancelJob(input.userId, input.id);
  const job = await prisma.processingJob.findFirst({ where: { id: input.id, userId: input.userId } });
  if (!job) throw new AppError("NOT_FOUND", "任务不存在。", 404);
  if (job.status !== "failed" && job.status !== "canceled") {
    throw new AppError("CONFLICT", "只有失败或已取消任务可以重试。", 409);
  }
  return enqueueJob({
    userId: input.userId,
    type: job.type,
    action: job.action ?? "retry",
    input: job.input === null ? {} : job.input as import("@prisma/client").Prisma.InputJsonValue,
    maxAttempts: job.maxAttempts,
    parentJobId: job.id,
    agentRunId: job.agentRunId ?? undefined,
  });
}
