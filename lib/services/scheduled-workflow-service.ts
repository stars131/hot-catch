import { Prisma, type ScheduledWorkflowType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { getQueue } from "@/lib/jobs/queues";
import { QUEUE_NAMES } from "@/lib/jobs/types";
import { WORKFLOW_DEFINITIONS } from "@/lib/workflows/definitions";

export async function listScheduledWorkflows(userId: string) {
  return prisma.scheduledWorkflow.findMany({
    where: { userId },
    include: { runs: { orderBy: { createdAt: "desc" }, take: 20 } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createScheduledWorkflow(input: {
  userId: string;
  socialConnectionId?: string | null;
  type: ScheduledWorkflowType;
  name: string;
  schedule: string;
  timezone: string;
  config: Prisma.InputJsonValue;
  maxRuns?: number;
}) {
  validateTimezone(input.timezone);
  if (input.socialConnectionId) {
    const account = await prisma.socialConnection.findFirst({ where: { id: input.socialConnectionId, userId: input.userId, archivedAt: null } });
    if (!account) throw new AppError("NOT_FOUND", "自动化账号不存在。", 404);
  }
  const workflow = await prisma.scheduledWorkflow.create({
    data: { ...input, status: "active" },
  });
  await registerWorkflowScheduler(workflow.id);
  return workflow;
}

export async function updateScheduledWorkflow(input: {
  userId: string;
  workflowId: string;
  action: "pause" | "resume" | "archive";
}) {
  const workflow = await prisma.scheduledWorkflow.findFirst({ where: { id: input.workflowId, userId: input.userId } });
  if (!workflow) throw new AppError("NOT_FOUND", "计划任务不存在。", 404);
  const status = input.action === "pause" ? "paused" : input.action === "archive" ? "archived" : "active";
  const updated = await prisma.scheduledWorkflow.update({ where: { id: workflow.id }, data: { status } });
  if (status === "active") await registerWorkflowScheduler(workflow.id);
  else await removeWorkflowScheduler(workflow.id, workflow.type);
  return updated;
}

export async function registerWorkflowScheduler(workflowId: string) {
  const workflow = await prisma.scheduledWorkflow.findUnique({ where: { id: workflowId } });
  if (!workflow || workflow.status !== "active") return;
  const definition = WORKFLOW_DEFINITIONS[workflow.type];
  const processingJob = await prisma.processingJob.upsert({
    where: { userId_type_idempotencyKey: { userId: workflow.userId, type: definition.jobType, idempotencyKey: `workflow-scheduler:${workflow.id}` } },
    update: { status: "queued", input: { workflowId: workflow.id } },
    create: {
      userId: workflow.userId,
      type: definition.jobType,
      queueName: QUEUE_NAMES[definition.jobType],
      status: "queued",
      action: "workflow.dispatch",
      input: { workflowId: workflow.id },
      idempotencyKey: `workflow-scheduler:${workflow.id}`,
      maxAttempts: 3,
    },
  });
  await getQueue(definition.jobType).upsertJobScheduler(
    `workflow:${workflow.id}`,
    { pattern: workflow.schedule, tz: workflow.timezone, ...(workflow.maxRuns ? { limit: workflow.maxRuns } : {}) },
    {
      name: "workflow.dispatch",
      data: { databaseJobId: processingJob.id, userId: workflow.userId, action: "workflow.dispatch", input: { workflowId: workflow.id } },
      opts: { attempts: 3, backoff: { type: "exponential", delay: 2_000 } },
    },
  );
}

async function removeWorkflowScheduler(workflowId: string, type: ScheduledWorkflowType) {
  await getQueue(WORKFLOW_DEFINITIONS[type].jobType).removeJobScheduler(`workflow:${workflowId}`);
}

function validateTimezone(timezone: string) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); }
  catch { throw new AppError("VALIDATION_ERROR", "时区无效。", 422); }
}
