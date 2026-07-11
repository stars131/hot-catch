import { JobType, Prisma, type ProcessingJob } from "@prisma/client";
import { Queue } from "bullmq";
import { prisma } from "@/lib/prisma";
import { getRedisConnection } from "@/lib/jobs/connection";
import { QUEUE_NAMES, type JobPayload, type JobResult } from "@/lib/jobs/types";
import { AppError } from "@/lib/errors";

const queues = new Map<JobType, Queue<JobPayload, JobResult>>();

export function getQueue(type: JobType) {
  const existing = queues.get(type);
  if (existing) return existing;

  const queue = new Queue<JobPayload, JobResult>(QUEUE_NAMES[type], {
    connection: getRedisConnection(),
    defaultJobOptions: {
      attempts: type === JobType.publish ? 2 : 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 2000 },
    },
  });
  queues.set(type, queue);
  return queue;
}

type EnqueueInput = {
  userId: string;
  type: JobType;
  action: string;
  input: Prisma.InputJsonValue;
  idempotencyKey?: string;
  maxAttempts?: number;
  delayMs?: number;
  agentRunId?: string;
  parentJobId?: string;
};

export async function enqueueJob(input: EnqueueInput): Promise<ProcessingJob> {
  if (input.idempotencyKey) {
    const existing = await prisma.processingJob.findUnique({
      where: {
        userId_type_idempotencyKey: {
          userId: input.userId,
          type: input.type,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) return existing;
  }

  let databaseJob: ProcessingJob;
  try {
    databaseJob = await prisma.processingJob.create({
      data: {
        userId: input.userId,
        type: input.type,
        queueName: QUEUE_NAMES[input.type],
        input: input.input,
        action: input.action,
        agentRunId: input.agentRunId,
        parentJobId: input.parentJobId,
        idempotencyKey: input.idempotencyKey,
        maxAttempts: input.maxAttempts ?? (input.type === JobType.publish ? 2 : 3),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.processingJob.findUnique({
        where: {
          userId_type_idempotencyKey: {
            userId: input.userId,
            type: input.type,
            idempotencyKey: input.idempotencyKey ?? "",
          },
        },
      });
      if (existing) return existing;
    }
    throw error;
  }

  try {
    await getQueue(input.type).add(
      input.action,
      {
        databaseJobId: databaseJob.id,
        userId: input.userId,
        action: input.action,
        input: input.input,
      },
      {
        jobId: databaseJob.id,
        attempts: databaseJob.maxAttempts,
        delay: input.delayMs,
      },
    );
    return databaseJob;
  } catch (error) {
    await prisma.processingJob.update({
      where: { id: databaseJob.id },
      data: {
        status: "failed",
        errorCode: "QUEUE_UNAVAILABLE",
        errorMessage: "Redis 队列不可用，请检查依赖后重试。",
        completedAt: new Date(),
      },
    });
    throw new AppError(
      "DEPENDENCY_UNAVAILABLE",
      "Redis 队列不可用，请检查依赖后重试。",
      503,
      envSafeError(error),
    );
  }
}

function envSafeError(error: unknown) {
  if (process.env.NODE_ENV === "production") return undefined;
  return error instanceof Error ? error.message : String(error);
}

export async function cancelJob(userId: string, databaseJobId: string) {
  const databaseJob = await prisma.processingJob.findFirst({
    where: { id: databaseJobId, userId },
  });
  if (!databaseJob) throw new AppError("NOT_FOUND", "任务不存在。", 404);
  if (["succeeded", "failed", "canceled"].includes(databaseJob.status)) {
    return databaseJob;
  }

  const queueJob = await getQueue(databaseJob.type).getJob(databaseJob.id);
  if (queueJob) {
    const state = await queueJob.getState();
    if (["waiting", "delayed", "paused", "prioritized"].includes(state)) {
      await queueJob.remove();
    }
  }

  return prisma.processingJob.update({
    where: { id: databaseJob.id },
    data: { status: "canceled", canceledAt: new Date(), completedAt: new Date() },
  });
}
