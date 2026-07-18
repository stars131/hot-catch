import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobType } from "@prisma/client";
import { Worker } from "bullmq";
import { prisma } from "@/lib/prisma";
import { getRedisConnection } from "@/lib/jobs/connection";
import { enqueueJob, getQueue } from "@/lib/jobs/queues";
import { processQueuedJob } from "@/lib/jobs/processor";
import type { JobPayload, JobResult } from "@/lib/jobs/types";
import "@/lib/jobs/handlers";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userId = "";
let worker: Worker<JobPayload, JobResult>;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `queue-${runId}@example.com` },
  });
  userId = user.id;
  worker = new Worker<JobPayload, JobResult>("ingest", processQueuedJob, {
    connection: getRedisConnection(),
    concurrency: 1,
  });
  await worker.waitUntilReady();
});

afterAll(async () => {
  await worker.close();
  await getQueue(JobType.ingest).close();
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
  await getRedisConnection().quit();
});

describe("BullMQ processing", () => {
  it("persists progress and deduplicates by business key", async () => {
    const input = {
      userId,
      type: JobType.ingest,
      action: "system.smoke",
      input: { test: runId },
      idempotencyKey: `smoke-${runId}`,
    } as const;
    const first = await enqueueJob(input);
    const duplicate = await enqueueJob(input);
    expect(duplicate.id).toBe(first.id);

    await expect
      .poll(
        async () =>
          (
            await prisma.processingJob.findUnique({ where: { id: first.id } })
          )?.status,
        { timeout: 10_000 },
      )
      .toBe("succeeded");

    const completed = await prisma.processingJob.findUniqueOrThrow({
      where: { id: first.id },
    });
    expect(completed).toMatchObject({ progress: 100, stage: "完成", attempts: 1 });
  });
});
