import type { Job } from "bullmq";
import { prisma } from "@/lib/prisma";
import { getJobHandler } from "@/lib/jobs/handlers";
import type { JobPayload, JobResult } from "@/lib/jobs/types";

export async function processQueuedJob(
  job: Job<JobPayload, JobResult>,
): Promise<JobResult> {
  const { databaseJobId } = job.data;
  const databaseJob = await prisma.processingJob.findUnique({
    where: { id: databaseJobId },
    select: { status: true },
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
  return result;
}

export async function recordJobFailure(
  job: Job<JobPayload, JobResult> | undefined,
  error: Error,
) {
  if (!job) return;
  const attempts = job.attemptsMade;
  const maxAttempts = job.opts.attempts ?? 1;
  if (attempts < maxAttempts) {
    await prisma.processingJob.updateMany({
      where: { id: job.data.databaseJobId, status: { not: "canceled" } },
      data: { status: "queued", stage: "等待重试", errorMessage: error.message },
    });
    return;
  }

  await prisma.processingJob.updateMany({
    where: { id: job.data.databaseJobId, status: { not: "canceled" } },
    data: {
      status: "failed",
      errorCode: "JOB_HANDLER_FAILED",
      errorMessage: error.message,
      completedAt: new Date(),
    },
  });
}
