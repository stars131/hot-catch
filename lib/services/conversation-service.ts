import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { truncate } from "@/lib/utils";
import type { MessageRole, Prisma } from "@prisma/client";

export async function listConversations(userId: string) {
  return prisma.conversation.findMany({
    where: { userId },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function ensureConversation(
  userId: string,
  conversationId?: string,
  seedTitle?: string
) {
  if (conversationId) {
    const existing = await prisma.conversation.findFirst({
      where: { id: conversationId, userId },
    });
    if (!existing) throw new AppError("NOT_FOUND", "Conversation not found.", 404);
    return existing;
  }

  return prisma.conversation.create({
    data: {
      userId,
      title: seedTitle ? truncate(seedTitle, 48) : "New benchmark session",
    },
  });
}

export async function getConversationWithMessages(userId: string, id: string) {
  return prisma.conversation.findFirst({
    where: { id, userId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      contents: { orderBy: { updatedAt: "desc" }, take: 10 },
    },
  });
}

export async function deleteConversation(userId: string, id: string) {
  const conversation = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!conversation) throw new AppError("NOT_FOUND", "Conversation not found.", 404);
  await prisma.conversation.delete({ where: { id } });
}

export async function addMessage(params: {
  conversationId: string;
  role: MessageRole;
  content: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const message = await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      metadata: params.metadata,
    },
  });
  await prisma.conversation.update({
    where: { id: params.conversationId },
    data: { updatedAt: new Date() },
  });
  return message;
}
