import { LlmProviderName, Prisma, type Platform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { getEffectivePersona } from "@/lib/services/persona-service";
import { resolveMemoriesForContext } from "@/lib/services/memory-service";
import { modelCapabilities } from "@/lib/providers/model-capabilities";
import { LLM_PROVIDER_DEFINITIONS } from "@/lib/providers/llm-config";
import type { SkillSnapshot } from "@/lib/skills/catalog";
import type { DirectionSnapshot } from "@/lib/creator/creative-direction";

export type AccountBindings = Partial<Record<Platform, string>>;

export async function createConversationContextVersion(input: {
  userId: string;
  conversationId: string;
  accountBindings?: AccountBindings;
  targetPlatforms: Platform[];
  contentLocale: string;
  skills: SkillSnapshot[];
  references?: unknown[];
  creativeDirectionSnapshot?: DirectionSnapshot;
  promptVersion?: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, userId: input.userId },
  });
  if (!conversation) throw new AppError("NOT_FOUND", "会话不存在。", 404);
  const accountIds = [...new Set(Object.values(input.accountBindings ?? {}).filter(Boolean))];
  const accounts = accountIds.length
    ? await prisma.socialConnection.findMany({
        where: { id: { in: accountIds }, userId: input.userId, archivedAt: null },
      })
    : [];
  if (accounts.length !== accountIds.length) {
    throw new AppError("FORBIDDEN", "创作设置中包含无权访问的账号。", 403);
  }
  const byId = new Map(accounts.map((account) => [account.id, account]));
  for (const [platform, accountId] of Object.entries(input.accountBindings ?? {})) {
    if (accountId && byId.get(accountId)?.platform !== platform) {
      throw new AppError("VALIDATION_ERROR", "目标账号与平台不匹配。", 422);
    }
  }

  const personaEntries = await Promise.all(input.targetPlatforms.map(async (platform) => {
    const accountId = input.accountBindings?.[platform];
    const persona = await getEffectivePersona(input.userId, null, accountId);
    return [platform, persona ? snapshotPersona(persona) : null] as const;
  }));
  const memoryEntries = await Promise.all(input.targetPlatforms.map(async (platform) => {
    const memories = await resolveMemoriesForContext(input.userId, input.accountBindings?.[platform]);
    return [platform, memories.map((memory) => ({
      id: memory.id,
      scope: memory.scope,
      kind: memory.kind,
      status: memory.status,
      title: memory.title,
      body: memory.body,
      confidence: memory.confidence,
      sourceType: memory.sourceType,
    }))] as const;
  }));
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { defaultLlmProvider: true },
  });
  const provider = user?.defaultLlmProvider ?? LlmProviderName.deepseek;
  const model = LLM_PROVIDER_DEFINITIONS[provider].defaultModel;
  const capabilities = modelCapabilities(provider, model);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.conversation.update({
      where: { id: input.conversationId },
      data: { activeContextVersion: { increment: 1 } },
      select: { activeContextVersion: true },
    });
    return tx.conversationContextVersion.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        version: updated.activeContextVersion,
        accountBindings: toJson(input.accountBindings ?? {}),
        personaSnapshot: toJson(Object.fromEntries(personaEntries)),
        memorySnapshot: toJson(Object.fromEntries(memoryEntries)),
        modelProvider: provider,
        modelName: model,
        modelContextWindow: capabilities.contextWindow,
        contentLocale: input.contentLocale,
        targetPlatforms: input.targetPlatforms,
        skillSnapshots: toJson(input.skills),
        referenceSnapshot: toJson(input.references ?? []),
        creativeDirectionSnapshot: input.creativeDirectionSnapshot
          ? toJson(input.creativeDirectionSnapshot)
          : Prisma.JsonNull,
        promptVersion: input.promptVersion,
      },
    });
  });
}

export function contextSnapshotForPlatform(
  context: Awaited<ReturnType<typeof createConversationContextVersion>>,
  platform: Platform,
) {
  const personas = asRecord(context.personaSnapshot);
  const memories = asRecord(context.memorySnapshot);
  const accounts = asRecord(context.accountBindings);
  return {
    contextVersionId: context.id,
    contextVersion: context.version,
    platform,
    socialConnectionId: typeof accounts[platform] === "string" ? accounts[platform] : null,
    persona: personas[platform] ?? null,
    memories: memories[platform] ?? [],
    model: { provider: context.modelProvider, name: context.modelName, contextWindow: context.modelContextWindow },
    contentLocale: context.contentLocale,
    skills: context.skillSnapshots,
    references: context.referenceSnapshot,
    creativeDirection: context.creativeDirectionSnapshot,
    promptVersion: context.promptVersion,
    capturedAt: context.createdAt.toISOString(),
  };
}

function snapshotPersona(persona: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(persona).filter(([key]) => !["userId", "createdAt", "updatedAt"].includes(key)),
  );
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
