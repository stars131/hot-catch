import { JobType } from "@prisma/client";
import { Worker } from "bullmq";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { getRedisConnection } from "@/lib/jobs/connection";
import { processQueuedJob, recordJobFailure } from "@/lib/jobs/processor";
import "@/lib/jobs/reference-import-handler";
import "@/lib/jobs/style-profile-handler";
import "@/lib/jobs/content-generation-handler";
import "@/lib/jobs/transcription-handler";
import "@/lib/jobs/publishing-handler";
import "@/lib/jobs/metrics-handler";
import { QUEUE_NAMES, type JobPayload, type JobResult } from "@/lib/jobs/types";

const workers = Object.values(JobType).map(
  (type) =>
    new Worker<JobPayload, JobResult>(
      QUEUE_NAMES[type],
      processQueuedJob,
      {
        connection: getRedisConnection(),
        concurrency: env.WORKER_CONCURRENCY,
      },
    ),
);

for (const worker of workers) {
  worker.on("failed", async (job, error) => {
    await recordJobFailure(job, error);
  });
}

async function shutdown() {
  await Promise.all(workers.map((worker) => worker.close()));
  await prisma.$disconnect();
}

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
