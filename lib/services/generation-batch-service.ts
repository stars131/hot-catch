import { createHash, randomUUID } from "node:crypto";
import { JobType, Prisma } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { isForeignPlatformCreationEnabled } from "@/lib/env";
import { enqueueJob } from "@/lib/jobs/queues";
import {
  GLOBAL_PLATFORM_IDS,
  PLATFORM_DEFINITIONS,
  type PlatformId,
  type UiLocale,
} from "@/lib/platforms/registry";
import { prisma } from "@/lib/prisma";
import { resolveSelectedSkills, skillSnapshotsJson } from "@/lib/services/skill-service";
import type { GenerationBatchInput } from "@/lib/validators/generation-batch";
import { CHAT_PROTOCOL } from "@/lib/creator/chat-protocol";
import { chatMessageMetadataV1Schema } from "@/lib/creator/chat-schemas";
import {
  contextSnapshotForPlatform,
  createConversationContextVersion,
} from "@/lib/services/conversation-context-service";
import { resolveDirectionSelectionSnapshot } from "@/lib/services/creative-direction-service";

const BATCH_MESSAGE_PREFIX = "generation-batch:";

export async function createGenerationBatch(params: {
  userId: string;
  conversationId: string;
  input: GenerationBatchInput;
  idempotencyKey?: string;
  uiLocale: UiLocale;
}) {
  assertFeatureAvailability(params.input.targetPlatforms);
  const conversation = await prisma.conversation.findFirst({
    where: { id: params.conversationId, userId: params.userId },
  });
  if (!conversation) throw new AppError("NOT_FOUND", "创作会话不存在。", 404);

  const skills = await resolveSelectedSkills(
    params.userId,
    params.input.skillIds,
    "generation",
  );
  const sharedReferences = await prisma.contentReference.findMany({
    where: {
      userId: params.userId,
      content: { conversationId: params.conversationId },
    },
    distinct: ["fingerprint"],
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      benchmarkAccountId: true,
      benchmarkNoteId: true,
      ideaId: true,
      role: true,
      sourceUrl: true,
      fingerprint: true,
      snapshot: true,
    },
  });
  const accountBindings = params.input.accountBindings ?? {};
  const directionSnapshot = params.input.directionSelection
    ? await resolveDirectionSelectionSnapshot({
        userId: params.userId,
        conversationId: params.conversationId,
        selection: params.input.directionSelection,
      })
    : undefined;
  const contextVersion = await createConversationContextVersion({
    userId: params.userId,
    conversationId: params.conversationId,
    accountBindings,
    targetPlatforms: params.input.targetPlatforms,
    contentLocale: params.input.targetLocale,
    skills,
    references: sharedReferences.map((reference) => reference.snapshot),
    creativeDirectionSnapshot: directionSnapshot,
    promptVersion: "generation-batch/v2",
  });
  const requestKey = params.idempotencyKey ?? randomUUID();
  const clientMessageId = `${BATCH_MESSAGE_PREFIX}${requestKey}`;
  const replayed = await loadGenerationBatch(params.userId, params.conversationId, clientMessageId);
  if (replayed) return { ...replayed, replayed: true };

  let created: {
    runId: string;
    assistantMessageId: string;
    contents: Array<{ contentId: string; platform: PlatformId }>;
  };
  try {
    created = await prisma.$transaction(async (tx) => {
      const requestMessage = await tx.message.create({
        data: {
          conversationId: params.conversationId,
          role: "user",
          content: params.input.brief,
          status: "complete",
          clientMessageId,
        },
      });
      const assistantMessage = await tx.message.create({
        data: {
          conversationId: params.conversationId,
          role: "assistant",
          content: "正在创建多平台创作包。",
          status: "pending",
          clientMessageId: `assistant:${clientMessageId}`,
        },
      });
      const run = await tx.agentRun.create({
        data: {
          userId: params.userId,
          conversationId: params.conversationId,
          requestMessageId: requestMessage.id,
          assistantMessageId: assistantMessage.id,
          status: "running",
          command: "content.generate_bundle",
          contextVersionId: contextVersion.id,
          input: {
            brief: params.input.brief,
            targetPlatforms: params.input.targetPlatforms,
            targetLocale: params.input.targetLocale,
            directionSelection: params.input.directionSelection,
            skillIds: skills.map((skill) => skill.id),
            expectedCount: params.input.targetPlatforms.length,
            uiLocale: params.uiLocale,
          } as Prisma.InputJsonValue,
          startedAt: new Date(),
        },
      });
      const contents: Array<{ contentId: string; platform: PlatformId }> = [];
      for (const platform of params.input.targetPlatforms) {
        const definition = PLATFORM_DEFINITIONS[platform];
        const contextSnapshot = contextSnapshotForPlatform(contextVersion, platform);
        const personaSnapshot = contextSnapshot.persona as { id?: string } | null;
        const content = await tx.generatedContent.create({
          data: {
            userId: params.userId,
            conversationId: params.conversationId,
            platform,
            contentKind: definition.contentKind,
            contentLocale: params.input.targetLocale,
            title: params.input.brief.slice(0, 120),
            inputType: "draft",
            inputText: params.input.brief,
            personaId: personaSnapshot?.id,
            targetSocialConnectionId: accountBindings[platform],
            contextSnapshot: contextSnapshot as Prisma.InputJsonValue,
            outputType: definition.contentKind,
            selectedSkillIds: skills.map((skill) => skill.id),
            skillSnapshots: skills.length
              ? skillSnapshotsJson(skills)
              : Prisma.JsonNull,
          },
        });
        contents.push({ contentId: content.id, platform });
        if (sharedReferences.length) {
          await tx.contentReference.createMany({
            data: sharedReferences.map((reference) => ({
              userId: params.userId,
              contentId: content.id,
              benchmarkAccountId: reference.benchmarkAccountId,
              benchmarkNoteId: reference.benchmarkNoteId,
              ideaId: reference.ideaId,
              role: reference.role,
              sourceUrl: reference.sourceUrl,
              fingerprint: reference.fingerprint,
              snapshot: reference.snapshot as Prisma.InputJsonValue,
            })),
            skipDuplicates: true,
          });
        }
      }
      await tx.conversation.update({
        where: { id: params.conversationId },
        data: {
          title: conversation.title || params.input.brief.slice(0, 48),
          targetPlatforms: params.input.targetPlatforms,
          targetLocale: params.input.targetLocale,
          activeSkillIds: skills.map((skill) => skill.id),
          updatedAt: new Date(),
        },
      });
      return {
        runId: run.id,
        assistantMessageId: assistantMessage.id,
        contents,
      };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await loadGenerationBatch(
        params.userId,
        params.conversationId,
        clientMessageId,
      );
      if (raced) return { ...raced, replayed: true };
    }
    throw error;
  }

  const items: GenerationBatchItem[] = [];
  for (const item of created.contents) {
    try {
      const job = await enqueueJob({
        userId: params.userId,
        type: JobType.analysis,
        action: "content.generate",
        input: {
          contentId: item.contentId,
          conversationId: params.conversationId,
          skillIds: skills.map((skill) => skill.id),
          uiLocale: params.uiLocale,
        },
        idempotencyKey: batchJobKey(created.runId, item.platform),
        agentRunId: created.runId,
      });
      items.push({
        platform: item.platform,
        contentId: item.contentId,
        jobId: job.id,
        status: job.status,
      });
    } catch {
      const failed = await prisma.processingJob.findFirst({
        where: {
          userId: params.userId,
          type: JobType.analysis,
          idempotencyKey: batchJobKey(created.runId, item.platform),
        },
      });
      items.push({
        platform: item.platform,
        contentId: item.contentId,
        jobId: failed?.id ?? null,
        status: failed?.status ?? "failed",
      });
    }
  }

  const metadata = chatMessageMetadataV1Schema.parse({
    protocol: CHAT_PROTOCOL,
    runId: created.runId,
    cards: items
      .filter((item): item is GenerationBatchItem & { jobId: string } => Boolean(item.jobId))
      .map((item) => ({
        id: `card-progress-${item.jobId}`,
        version: 1,
        type: "progress",
        jobId: item.jobId,
        title: `${PLATFORM_DEFINITIONS[item.platform].displayName} 创作`,
        display: "steps",
        cancelable: true,
      })),
  });
  const allFailed = items.every((item) => item.status === "failed");
  await prisma.$transaction([
    prisma.message.update({
      where: { id: created.assistantMessageId },
      data: {
        content: allFailed
          ? "创作任务未能进入队列，请稍后重试。"
          : `已建立 ${items.length} 个相互独立的平台任务，正在生成内容。`,
        status: allFailed ? "failed" : "complete",
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    }),
    ...(allFailed
      ? [
          prisma.agentRun.update({
            where: { id: created.runId },
            data: {
              status: "failed",
              errorCode: "QUEUE_UNAVAILABLE",
              errorMessage: "所有平台任务均未能进入队列。",
              completedAt: new Date(),
            },
          }),
        ]
      : []),
  ]);

  return { runId: created.runId, items, replayed: false };
}

export type GenerationBatchItem = {
  platform: PlatformId;
  contentId: string;
  jobId: string | null;
  status: string;
};

async function loadGenerationBatch(
  userId: string,
  conversationId: string,
  clientMessageId: string,
) {
  const request = await prisma.message.findUnique({
    where: { conversationId_clientMessageId: { conversationId, clientMessageId } },
  });
  if (!request) return null;
  const run = await prisma.agentRun.findFirst({
    where: { userId, conversationId, requestMessageId: request.id },
    include: { jobs: { orderBy: { createdAt: "asc" } } },
  });
  if (!run || run.command !== "content.generate_bundle") return null;
  const targetPlatforms = readPlatforms(run.input);
  const items = run.jobs.map((job, index) => {
    const input = asRecord(job.input);
    return {
      platform: targetPlatforms[index] ?? "xiaohongshu",
      contentId: typeof input.contentId === "string" ? input.contentId : "",
      jobId: job.id,
      status: job.status,
    } satisfies GenerationBatchItem;
  });
  return { runId: run.id, items };
}

function readPlatforms(value: unknown): PlatformId[] {
  const platforms = asRecord(value).targetPlatforms;
  return Array.isArray(platforms)
    ? platforms.filter((value): value is PlatformId =>
        Object.prototype.hasOwnProperty.call(PLATFORM_DEFINITIONS, value),
      )
    : [];
}

function assertFeatureAvailability(platforms: readonly PlatformId[]) {
  if (
    !isForeignPlatformCreationEnabled() &&
    platforms.some((platform) => GLOBAL_PLATFORM_IDS.includes(platform))
  ) {
    throw new AppError(
      "FEATURE_DISABLED",
      "国外平台创作功能尚未在当前环境开启。",
      404,
    );
  }
}

function batchJobKey(runId: string, platform: PlatformId) {
  return createHash("sha256").update(`${runId}:${platform}`).digest("hex");
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
