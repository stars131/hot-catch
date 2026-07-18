import { JobType } from "@prisma/client";
import { Worker } from "bullmq";
import { createServer, type Server } from "node:net";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createRedisConnection } from "@/lib/jobs/connection";
import { processQueuedJob, recordJobFailure } from "@/lib/jobs/processor";
import "@/lib/jobs/reference-import-handler";
import "@/lib/jobs/style-profile-handler";
import "@/lib/jobs/content-generation-handler";
import "@/lib/jobs/transcription-handler";
import "@/lib/jobs/publishing-handler";
import "@/lib/jobs/metrics-handler";
import "@/lib/jobs/tracking-handler";
import "@/lib/jobs/workflow-handler";
import { QUEUE_NAMES, type JobPayload, type JobResult } from "@/lib/jobs/types";

const jobTypes = Object.values(JobType);
const connections = jobTypes.map(() => createRedisConnection());
const workers: Array<Worker<JobPayload, JobResult>> = [];
let readinessServer: Server | null = null;

async function startReadinessServer() {
  const rawPort = process.env.E2E_WORKER_READY_PORT;
  if (!rawPort) return;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid E2E_WORKER_READY_PORT: ${rawPort}`);
  }

  const server = createServer((socket) => socket.end());
  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => reject(error);
    server.once("error", handleError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", handleError);
      readinessServer = server;
      resolve();
    });
  });
}

async function startWorkers() {
  await Promise.all(connections.map((connection) => connection.ping()));
  for (const [index, type] of jobTypes.entries()) {
    const worker = new Worker<JobPayload, JobResult>(
      QUEUE_NAMES[type],
      processQueuedJob,
      {
        connection: connections[index],
        concurrency: env.WORKER_CONCURRENCY,
      },
    );
    worker.on("failed", async (job, error) => {
      await recordJobFailure(job, error);
    });
    workers.push(worker);
  }
  await startReadinessServer();
  process.stdout.write("STARTRACE_WORKER_READY\n");
}

async function shutdown() {
  await Promise.all(workers.map((worker) => worker.close()));
  await new Promise<void>((resolve) => {
    if (!readinessServer?.listening) return resolve();
    readinessServer.close(() => resolve());
  });
  await Promise.all(connections.map(async (connection) => {
    if (connection.status === "end") return;
    await connection.quit().catch(() => connection.disconnect());
  }));
  await prisma.$disconnect();
}

void startWorkers().catch((error: unknown) => {
  console.error("Worker startup failed", error);
  void shutdown().finally(() => process.exit(1));
});

process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
