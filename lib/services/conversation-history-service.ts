import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import {
  contextUsage,
  estimateTokens,
  selectMessagesForCompression,
} from "@/lib/conversations/context-policy";
import { appendConversationEvent } from "@/lib/events/event-service";

const DEFAULT_CONTEXT_WINDOW = 128_000;

export async function getConversationContextUsage(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      messages: { select: { content: true } },
      segments: { select: { tokenEstimate: true } },
      contextVersions: { orderBy: { version: "desc" }, take: 1, select: { modelContextWindow: true } },
    },
  });
  if (!conversation) throw new AppError("NOT_FOUND", "会话不存在。", 404);
  const messageTokens = conversation.messages.reduce((sum, message) => sum + estimateTokens(message.content), 0);
  const checkpointTokens = conversation.segments.reduce((sum, segment) => sum + Math.min(segment.tokenEstimate, 1200), 0);
  const usage = contextUsage(messageTokens + checkpointTokens, conversation.contextVersions[0]?.modelContextWindow ?? DEFAULT_CONTEXT_WINDOW);
  return { ...usage, checkpointCount: conversation.segments.length };
}

export async function compactConversationIfNeeded(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      segments: { orderBy: { createdAt: "desc" }, take: 1 },
      contextVersions: { orderBy: { version: "desc" }, take: 1 },
      interactions: { where: { status: "pending" }, select: { messageId: true } },
    },
  });
  if (!conversation) throw new AppError("NOT_FOUND", "会话不存在。", 404);
  const lastEnd = conversation.segments[0]?.endMessageId;
  const startIndex = lastEnd
    ? Math.max(0, conversation.messages.findIndex((message) => message.id === lastEnd) + 1)
    : 0;
  const candidates = conversation.messages.slice(startIndex);
  const selected = selectMessagesForCompression(
    candidates,
    conversation.contextVersions[0]?.modelContextWindow ?? DEFAULT_CONTEXT_WINDOW,
  );
  const pendingMessageIds = new Set(conversation.interactions.flatMap((item) => item.messageId ? [item.messageId] : []));
  const compress = selected.compress.filter((message) => !pendingMessageIds.has(message.id));
  if (!compress.length) return null;

  const ledger = deterministicLedger(compress.map((message) => message.metadata));
  const summary = compress.map((message) => {
    const body = message.content.trim().replace(/\s+/g, " ").slice(0, 220);
    return `${message.role}: ${body}`;
  }).join("\n");
  const segment = await prisma.conversationSegment.create({
    data: {
      userId,
      conversationId,
      startMessageId: compress[0].id,
      endMessageId: compress[compress.length - 1].id,
      messageCount: compress.length,
      tokenEstimate: compress.reduce((sum, message) => sum + estimateTokens(message.content), 0),
      summary: summary.slice(0, 16_000),
      ledger,
    },
  });
  await appendConversationEvent({
    userId,
    conversationId,
    type: "checkpoint.created",
    payload: { segmentId: segment.id, messageCount: segment.messageCount, ledger },
  });
  return segment;
}

export async function branchConversation(input: {
  userId: string;
  conversationId: string;
  fromMessageId: string;
  replacementText: string;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, userId: input.userId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) throw new AppError("NOT_FOUND", "会话不存在。", 404);
  const index = conversation.messages.findIndex((message) => message.id === input.fromMessageId);
  if (index < 0) throw new AppError("NOT_FOUND", "分支起点消息不存在。", 404);
  const source = conversation.messages[index];
  if (source.role !== "user") throw new AppError("VALIDATION_ERROR", "只能编辑用户消息并创建分支。", 422);
  return prisma.$transaction(async (tx) => {
    const branch = await tx.conversation.create({
      data: {
        userId: input.userId,
        title: `${conversation.title ?? "会话"} · 分支`,
        activeSkillIds: conversation.activeSkillIds,
        targetPlatforms: conversation.targetPlatforms,
        targetLocale: conversation.targetLocale,
        parentConversationId: conversation.id,
        baseMessageId: source.id,
      },
    });
    const copied = conversation.messages.slice(0, index).map((message) => ({
      conversationId: branch.id,
      role: message.role,
      content: message.content,
      metadata: message.metadata ?? Prisma.JsonNull,
      status: message.status,
      protocolVersion: message.protocolVersion,
    }));
    if (copied.length) await tx.message.createMany({ data: copied });
    await tx.message.create({
      data: { conversationId: branch.id, role: "user", content: input.replacementText, status: "complete" },
    });
    return branch;
  });
}

function deterministicLedger(metadata: Array<Prisma.JsonValue | null>): Prisma.InputJsonValue {
  const entities = new Map<string, Set<string>>();
  const visit = (value: unknown, key = "entity") => {
    if (Array.isArray(value)) return value.forEach((item) => visit(item, key));
    if (!value || typeof value !== "object") return;
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      if (typeof child === "string" && /(?:Id|ID)$/.test(childKey)) {
        const set = entities.get(childKey) ?? new Set<string>();
        set.add(child);
        entities.set(childKey, set);
      } else visit(child, childKey);
    }
  };
  metadata.forEach((value) => visit(value));
  return Object.fromEntries([...entities.entries()].map(([key, values]) => [key, [...values].sort()]));
}
