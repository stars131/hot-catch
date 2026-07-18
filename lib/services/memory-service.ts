import { Prisma, type MemoryKind, type MemoryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { shouldExtractMemory, sortMemoriesByPriority } from "@/lib/memory/policy";

export async function listMemories(input: {
  userId: string;
  socialConnectionId?: string | null;
  status?: MemoryStatus;
  query?: string;
}) {
  return prisma.accountMemory.findMany({
    where: {
      userId: input.userId,
      ...(input.socialConnectionId === undefined
        ? {}
        : { socialConnectionId: input.socialConnectionId }),
      ...(input.status ? { status: input.status } : {}),
      ...(input.query
        ? {
            OR: [
              { title: { contains: input.query, mode: "insensitive" } },
              { body: { contains: input.query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { audits: { orderBy: { createdAt: "desc" }, take: 10 } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 200,
  });
}

export async function createMemoryCandidate(input: {
  userId: string;
  socialConnectionId?: string | null;
  kind: MemoryKind;
  title: string;
  body: string;
  confidence?: number;
  sourceType: string;
  sourceId?: string;
  sourceExcerpt?: string;
}) {
  if (!shouldExtractMemory(input.body)) return null;
  if (input.socialConnectionId) await assertAccount(input.userId, input.socialConnectionId);
  const duplicate = await prisma.accountMemory.findFirst({
    where: {
      userId: input.userId,
      socialConnectionId: input.socialConnectionId ?? null,
      kind: input.kind,
      body: input.body.trim(),
      status: { in: ["candidate", "approved"] },
    },
  });
  if (duplicate) return duplicate;
  return prisma.accountMemory.create({
    data: {
      userId: input.userId,
      socialConnectionId: input.socialConnectionId,
      scope: input.socialConnectionId ? "account" : "global",
      kind: input.kind,
      status: "candidate",
      title: input.title.trim().slice(0, 160),
      body: input.body.trim(),
      confidence: Math.max(0, Math.min(input.confidence ?? 0.5, 1)),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceExcerpt: input.sourceExcerpt?.slice(0, 1000),
    },
  });
}

export async function reviewMemory(input: {
  userId: string;
  memoryId: string;
  action: "accept" | "reject" | "archive";
  reason?: string;
}) {
  const memory = await ownedMemory(input.userId, input.memoryId);
  const status: MemoryStatus = input.action === "accept"
    ? "approved"
    : input.action === "reject"
      ? "rejected"
      : "archived";
  return prisma.$transaction(async (tx) => {
    const updated = await tx.accountMemory.update({
      where: { id: memory.id },
      data: { status, reviewedAt: new Date() },
    });
    await tx.memoryAudit.create({
      data: {
        userId: input.userId,
        memoryId: memory.id,
        action: input.action,
        before: { status: memory.status },
        after: { status },
        reason: input.reason,
      },
    });
    return updated;
  });
}

export async function replaceMemory(input: {
  userId: string;
  memoryId: string;
  title: string;
  body: string;
  reason?: string;
}) {
  const memory = await ownedMemory(input.userId, input.memoryId);
  return prisma.$transaction(async (tx) => {
    const replacement = await tx.accountMemory.create({
      data: {
        userId: input.userId,
        socialConnectionId: memory.socialConnectionId,
        scope: memory.scope,
        kind: memory.kind,
        status: "approved",
        title: input.title,
        body: input.body,
        confidence: memory.confidence,
        sourceType: "memory_review",
        sourceId: memory.id,
        supersedesId: memory.id,
        reviewedAt: new Date(),
      },
    });
    await tx.accountMemory.update({ where: { id: memory.id }, data: { status: "archived" } });
    await tx.memoryAudit.create({
      data: {
        userId: input.userId,
        memoryId: memory.id,
        action: "replace",
        before: toJson(memory),
        after: { replacementId: replacement.id },
        reason: input.reason,
      },
    });
    return replacement;
  });
}

export async function resolveMemoriesForContext(userId: string, socialConnectionId?: string | null) {
  const memories = await prisma.accountMemory.findMany({
    where: {
      userId,
      status: { in: ["approved", "candidate"] },
      OR: [
        { scope: "global", socialConnectionId: null },
        ...(socialConnectionId ? [{ scope: "account" as const, socialConnectionId }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return sortMemoriesByPriority(memories).slice(0, 30);
}

async function ownedMemory(userId: string, memoryId: string) {
  const memory = await prisma.accountMemory.findFirst({ where: { id: memoryId, userId } });
  if (!memory) throw new AppError("NOT_FOUND", "记忆不存在。", 404);
  return memory;
}

async function assertAccount(userId: string, socialConnectionId: string) {
  const account = await prisma.socialConnection.findFirst({
    where: { id: socialConnectionId, userId, archivedAt: null },
  });
  if (!account) throw new AppError("NOT_FOUND", "账号不存在。", 404);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
