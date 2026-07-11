import { JobType, type Prisma } from "@prisma/client";

export const QUEUE_NAMES = {
  [JobType.ingest]: "ingest",
  [JobType.analysis]: "analysis",
  [JobType.publish]: "publish",
  [JobType.metrics]: "metrics",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[JobType];

export type JobPayload = {
  databaseJobId: string;
  userId: string;
  action: string;
  input: Prisma.InputJsonValue;
};

export type JobResult = {
  finalStatus?: "succeeded" | "waiting_input";
  resultType?: string;
  resultId?: string;
  output?: Prisma.InputJsonValue;
};

export type JobHandler = (
  payload: JobPayload,
  reportProgress: (progress: number, stage: string) => Promise<void>,
) => Promise<JobResult>;
