import { Prisma, type InteractionKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { appendConversationEvent } from "@/lib/events/event-service";

export async function createPendingInteraction(input: { userId: string; conversationId: string; agentRunId?: string; messageId?: string; kind: InteractionKind; actionKey: string; payload: Prisma.InputJsonValue; expiresAt?: Date }) {
  const interaction = await prisma.pendingInteraction.create({ data: { ...input, expiresAt: input.expiresAt ?? new Date(Date.now() + 7 * 86_400_000) } });
  await appendConversationEvent({ userId: input.userId, conversationId: input.conversationId, type: "interaction.created", payload: { interactionId: interaction.id, kind: interaction.kind, actionKey: interaction.actionKey, expiresAt: interaction.expiresAt.toISOString() } });
  return interaction;
}

export async function resolvePendingInteraction(input: { userId: string; interactionId: string; resolution: Prisma.InputJsonValue }) {
  const interaction = await prisma.pendingInteraction.findFirst({ where: { id: input.interactionId, userId: input.userId } });
  if (!interaction) throw new AppError("NOT_FOUND", "待处理交互不存在。", 404);
  if (interaction.status !== "pending") throw new AppError("CONFLICT", "该交互已处理。", 409);
  if (interaction.expiresAt <= new Date()) {
    await prisma.pendingInteraction.update({ where: { id: interaction.id }, data: { status: "expired" } });
    throw new AppError("CONFLICT", "该交互已过期。", 409);
  }
  const updated = await prisma.pendingInteraction.update({ where: { id: interaction.id }, data: { status: "resolved", resolution: input.resolution, resolvedAt: new Date() } });
  await appendConversationEvent({ userId: input.userId, conversationId: interaction.conversationId, type: "interaction.updated", payload: { interactionId: updated.id, status: updated.status } });
  return updated;
}

export async function resolvePendingInteractionByAction(input: {
  userId: string;
  conversationId: string;
  actionKey: string;
  resolution: Prisma.InputJsonValue;
}) {
  const interaction = await prisma.pendingInteraction.findFirst({
    where: {
      userId: input.userId,
      conversationId: input.conversationId,
      actionKey: input.actionKey,
      status: "pending",
    },
    orderBy: { createdAt: "desc" },
  });
  if (!interaction) return null;
  if (interaction.expiresAt <= new Date()) {
    await prisma.pendingInteraction.update({
      where: { id: interaction.id },
      data: { status: "expired" },
    });
    return null;
  }
  const updated = await prisma.pendingInteraction.update({
    where: { id: interaction.id },
    data: { status: "resolved", resolution: input.resolution, resolvedAt: new Date() },
  });
  await appendConversationEvent({
    userId: input.userId,
    conversationId: input.conversationId,
    type: "interaction.updated",
    payload: { interactionId: updated.id, status: updated.status },
  });
  return updated;
}
