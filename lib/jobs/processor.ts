import type { Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { isAppError } from "@/lib/errors";
import { getJobHandler } from "@/lib/jobs/handlers";
import type { JobPayload, JobResult } from "@/lib/jobs/types";

export async function processQueuedJob(
  job: Job<JobPayload, JobResult>,
): Promise<JobResult> {
  const { databaseJobId } = job.data;
  const databaseJob = await prisma.processingJob.findUnique({
    where: { id: databaseJobId },
    select: { status: true, agentRunId: true },
  });
  if (!databaseJob || databaseJob.status === "canceled") return {};

  await prisma.processingJob.update({
    where: { id: databaseJobId },
    data: {
      status: "running",
      attempts: { increment: 1 },
      startedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  });

  const handler = getJobHandler(job.data.action);
  const result = await handler(job.data, async (progress, stage) => {
    const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
    await job.updateProgress(safeProgress);
    await prisma.processingJob.updateMany({
      where: { id: databaseJobId, status: { not: "canceled" } },
      data: { progress: safeProgress, stage },
    });
  });

  const finalStatus = result.finalStatus ?? "succeeded";
  await prisma.processingJob.updateMany({
    where: { id: databaseJobId, status: { not: "canceled" } },
    data: {
      status: finalStatus,
      progress: finalStatus === "succeeded" ? 100 : 50,
      stage: finalStatus === "succeeded" ? "完成" : "等待人工补充",
      output: result.output,
      resultType: result.resultType,
      resultId: result.resultId,
      completedAt: finalStatus === "succeeded" ? new Date() : null,
    },
  });
  if (databaseJob.agentRunId) {
    await synchronizeGenerationBatchRun(databaseJob.agentRunId);
  }
  return result;
}

export async function recordJobFailure(
  job: Job<JobPayload, JobResult> | undefined,
  error: Error,
) {
  if (!job) return;
  const attempts = job.attemptsMade;
  const maxAttempts = job.opts.attempts ?? 1;
  const errorCode = isAppError(error) ? error.code : "JOB_HANDLER_FAILED";
  if (attempts < maxAttempts) {
    await prisma.processingJob.updateMany({
      where: { id: job.data.databaseJobId, status: { not: "canceled" } },
      data: {
        status: "queued",
        stage: "等待重试",
        errorCode,
        errorMessage: error.message,
      },
    });
    return;
  }

  await prisma.processingJob.updateMany({
    where: { id: job.data.databaseJobId, status: { not: "canceled" } },
    data: {
      status: "failed",
      errorCode,
      errorMessage: error.message,
      completedAt: new Date(),
    },
  });
  const databaseJob = await prisma.processingJob.findUnique({
    where: { id: job.data.databaseJobId },
    select: { agentRunId: true },
  });
  if (databaseJob?.agentRunId) {
    await synchronizeGenerationBatchRun(databaseJob.agentRunId);
  }
}

async function synchronizeGenerationBatchRun(runId: string) {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    include: { jobs: { orderBy: { createdAt: "asc" } } },
  });
  if (!run || run.command !== "content.generate_bundle") return;
  const input = asRecord(run.input);
  const expectedCount =
    typeof input.expectedCount === "number" ? input.expectedCount : run.jobs.length;
  if (run.jobs.length < expectedCount) return;

  const counts = Object.fromEntries(
    ["queued", "running", "waiting_input", "succeeded", "failed", "canceled"].map(
      (status) => [status, run.jobs.filter((job) => job.status === status).length],
    ),
  );
  const active = counts.queued + counts.running;
  const nextStatus = active
    ? "running"
    : counts.waiting_input
      ? "waiting_input"
      : counts.succeeded
        ? "completed"
        : counts.canceled === expectedCount
          ? "canceled"
          : "failed";
  await prisma.agentRun.update({
    where: { id: run.id },
    data: {
      status: nextStatus,
      output: {
        expectedCount,
        counts,
        partialFailure: counts.succeeded > 0 && counts.failed > 0,
        jobs: run.jobs.map((job) => ({
          jobId: job.id,
          status: job.status,
          resultId: job.resultId,
          errorCode: job.errorCode,
        })),
      },
      completedAt: ["completed", "failed", "canceled"].includes(nextStatus)
        ? new Date()
        : null,
      errorCode: nextStatus === "failed" ? "GENERATION_BATCH_FAILED" : null,
      errorMessage:
        nextStatus === "failed" ? "所有平台生成任务均未成功。" : null,
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
