import { randomUUID } from "node:crypto";
import { CredentialStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { PublishingAccount } from "@/lib/providers/types";
import type { z } from "zod";
import type {
  createManualConnectionSchema,
  updateConnectionSchema,
} from "@/lib/validators/social-connections";

type ManualConnectionInput = z.infer<typeof createManualConnectionSchema>;
type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>;

export async function listSocialConnections(userId: string, includeArchived = false) {
  return prisma.socialConnection.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    include: {
      personas: { orderBy: [{ status: "asc" }, { version: "desc" }] },
      contents: { orderBy: { updatedAt: "desc" }, take: 12, select: { id: true, title: true, platform: true, status: true, updatedAt: true } },
      _count: { select: { contents: true, memories: true, publications: true } },
    },
    orderBy: [{ isDefault: "desc" }, { platform: "asc" }, { updatedAt: "desc" }],
  });
}

export async function createManualSocialConnection(
  userId: string,
  input: ManualConnectionInput,
) {
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.socialConnection.updateMany({
        where: { userId, platform: input.platform, archivedAt: null },
        data: { isDefault: false },
      });
    }
    return tx.socialConnection.create({
      data: {
        userId,
        platform: input.platform,
        externalAccountId: `manual:${randomUUID()}`,
        source: "manual",
        provider: "manual",
        displayName: input.displayName,
        handle: cleanHandle(input.handle),
        avatarUrl: input.avatarUrl,
        isDefault: input.isDefault ?? false,
        status: "active",
      },
    });
  });
}

export async function syncAuthorizedAccounts(
  userId: string,
  accounts: PublishingAccount[],
  provider: string,
) {
  const synced = [];
  for (const account of accounts) {
    const existing = await prisma.socialConnection.findUnique({
      where: {
        userId_platform_externalAccountId: {
          userId,
          platform: account.platform,
          externalAccountId: account.id,
        },
      },
    });
    const candidate = existing
      ? null
      : await prisma.socialConnection.findFirst({
          where: {
            userId,
            platform: account.platform,
            source: "manual",
            archivedAt: null,
            displayName: { equals: account.name, mode: "insensitive" },
          },
        });

    if (candidate) {
      synced.push(
        await prisma.socialConnection.update({
          where: { id: candidate.id },
          data: {
            externalAccountId: account.id,
            source: "authorized",
            provider,
            displayName: account.name,
            avatarUrl: account.avatarUrl,
            status: mapProviderStatus(account.status),
            metadata: toJson(account.raw),
            archivedAt: null,
            lastValidatedAt: new Date(),
          },
        }),
      );
      continue;
    }

    synced.push(
      await prisma.socialConnection.upsert({
        where: {
          userId_platform_externalAccountId: {
            userId,
            platform: account.platform,
            externalAccountId: account.id,
          },
        },
        update: {
          source: "authorized",
          provider,
          displayName: account.name,
          avatarUrl: account.avatarUrl,
          status: mapProviderStatus(account.status),
          metadata: toJson(account.raw),
          archivedAt: null,
          lastValidatedAt: new Date(),
        },
        create: {
          userId,
          platform: account.platform,
          externalAccountId: account.id,
          source: "authorized",
          provider,
          displayName: account.name,
          avatarUrl: account.avatarUrl,
          status: mapProviderStatus(account.status),
          metadata: toJson(account.raw),
          lastValidatedAt: new Date(),
        },
      }),
    );
  }
  return synced;
}

export async function updateSocialConnection(userId: string, input: UpdateConnectionInput) {
  const connection = await prisma.socialConnection.findFirst({
    where: { id: input.id, userId },
  });
  if (!connection) throw new AppError("NOT_FOUND", "账号不存在。", 404);

  if (input.action === "archive") {
    return prisma.socialConnection.update({
      where: { id: connection.id },
      data: { archivedAt: new Date(), isDefault: false },
    });
  }
  if (input.action === "merge") {
    return mergeSocialConnections(userId, input.id, input.targetConnectionId);
  }

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.socialConnection.updateMany({
        where: { userId, platform: connection.platform, archivedAt: null },
        data: { isDefault: false },
      });
    }
    return tx.socialConnection.update({
      where: { id: connection.id },
      data: {
        displayName: input.displayName,
        handle: input.handle === undefined ? undefined : cleanHandle(input.handle),
        avatarUrl: input.avatarUrl,
        isDefault: input.isDefault,
      },
    });
  });
}

async function mergeSocialConnections(userId: string, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new AppError("VALIDATION_ERROR", "不能合并同一个账号。", 422);
  const [source, target] = await Promise.all([
    prisma.socialConnection.findFirst({ where: { id: sourceId, userId } }),
    prisma.socialConnection.findFirst({ where: { id: targetId, userId } }),
  ]);
  if (!source || !target) throw new AppError("NOT_FOUND", "待合并账号不存在。", 404);
  if (source.platform !== target.platform) {
    throw new AppError("VALIDATION_ERROR", "只能合并同平台账号。", 422);
  }
  return prisma.$transaction(async (tx) => {
    const [sourcePersonas, targetActive, targetVersion] = await Promise.all([
      tx.persona.findMany({
        where: { socialConnectionId: sourceId },
        orderBy: [{ version: "asc" }, { createdAt: "asc" }],
        select: { id: true, status: true },
      }),
      tx.persona.findFirst({
        where: { socialConnectionId: targetId, status: "active" },
        select: { id: true },
      }),
      tx.persona.aggregate({
        where: { socialConnectionId: targetId },
        _max: { version: true },
      }),
    ]);

    // 账号级 Persona 版本号在目标账号内唯一。逐条重编号，且目标已有 active
    // 时归档来源 active，避免触发“每账号最多一个 active”的部分唯一索引。
    let nextVersion = targetVersion._max.version ?? 0;
    for (const persona of sourcePersonas) {
      nextVersion += 1;
      await tx.persona.update({
        where: { id: persona.id },
        data: {
          socialConnectionId: targetId,
          version: nextVersion,
          status: targetActive && persona.status === "active" ? "archived" : persona.status,
          activatedAt: targetActive && persona.status === "active" ? null : undefined,
        },
      });
    }
    await Promise.all([
      tx.accountMemory.updateMany({ where: { socialConnectionId: sourceId }, data: { socialConnectionId: targetId } }),
      tx.generatedContent.updateMany({ where: { targetSocialConnectionId: sourceId }, data: { targetSocialConnectionId: targetId } }),
      tx.trackedPublication.updateMany({ where: { socialConnectionId: sourceId }, data: { socialConnectionId: targetId } }),
      tx.scheduledWorkflow.updateMany({ where: { socialConnectionId: sourceId }, data: { socialConnectionId: targetId } }),
    ]);
    await tx.socialConnection.update({
      where: { id: sourceId },
      data: { archivedAt: new Date(), isDefault: false, metadata: { mergedInto: targetId } },
    });
    return tx.socialConnection.update({
      where: { id: targetId },
      data: { isDefault: source.isDefault || target.isDefault },
    });
  });
}

function cleanHandle(value: string | null | undefined) {
  const cleaned = value?.trim().replace(/^@/, "");
  return cleaned || null;
}

function mapProviderStatus(status: PublishingAccount["status"]): CredentialStatus {
  return status === "active" ? "active" : "invalid";
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}
