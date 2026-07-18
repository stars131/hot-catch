import { Prisma, type QueuePolicy } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { appendConversationEvent } from "@/lib/events/event-service";

export async function listQueuedTurns(userId: string, conversationId: string) {
  await assertConversation(userId, conversationId);
  return prisma.queuedTurn.findMany({
    where: { userId, conversationId, status: { in: ["queued", "running"] } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export async function enqueueTurn(input: {
  userId: string;
  conversationId: string;
  clientTurnId: string;
  content: string;
  parts?: Prisma.InputJsonValue;
  context?: Prisma.InputJsonValue;
  policy?: QueuePolicy;
}) {
  await assertConversation(input.userId, input.conversationId);
  const activeRun = await prisma.agentRun.findFirst({
    where: { userId: input.userId, conversationId: input.conversationId, status: { in: ["pending", "running", "waiting_input"] } },
    orderBy: { createdAt: "desc" },
  });
  const requestedPolicy = input.policy ?? "append";
  const policy = requestedPolicy === "interrupt" && activeRun?.command?.startsWith("publish")
    ? "append"
    : requestedPolicy;
  if (policy === "interrupt" && activeRun && activeRun.status !== "waiting_input") {
    await prisma.agentRun.update({
      where: { id: activeRun.id },
      data: { status: "canceled", errorCode: "SAFE_INTERRUPT", completedAt: new Date() },
    });
  }
  const aggregate = await prisma.queuedTurn.aggregate({
    where: { conversationId: input.conversationId, status: "queued" },
    _max: { position: true },
  });
  const turn = await prisma.queuedTurn.upsert({
    where: { conversationId_clientTurnId: { conversationId: input.conversationId, clientTurnId: input.clientTurnId } },
    update: {},
    create: {
      userId: input.userId,
      conversationId: input.conversationId,
      clientTurnId: input.clientTurnId,
      position: (aggregate._max.position ?? 0) + 1,
      status: "queued",
      policy,
      content: input.content,
      parts: input.parts,
      context: input.context,
    },
  });
  await emitQueue(turn);
  return turn;
}

export async function updateQueuedTurn(input: {
  userId: string;
  turnId: string;
  action: "edit" | "move" | "cancel";
  content?: string;
  position?: number;
}) {
  const turn = await prisma.queuedTurn.findFirst({ where: { id: input.turnId, userId: input.userId } });
  if (!turn) throw new AppError("NOT_FOUND", "排队消息不存在。", 404);
  if (turn.status !== "queued") throw new AppError("CONFLICT", "只能修改仍在排队的消息。", 409);
  const updated = await prisma.queuedTurn.update({
    where: { id: turn.id },
    data: input.action === "cancel"
      ? { status: "canceled", completedAt: new Date() }
      : input.action === "edit"
        ? { content: input.content }
        : { position: Math.max(1, input.position ?? turn.position) },
  });
  await emitQueue(updated);
  return updated;
}

export async function claimNextQueuedTurn(userId: string, conversationId: string) {
  const running = await prisma.agentRun.count({
    where: { userId, conversationId, status: { in: ["pending", "running"] } },
  });
  if (running) return null;
  const next = await prisma.queuedTurn.findFirst({
    where: { userId, conversationId, status: "queued" },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  if (!next) return null;
  const claimed = await prisma.queuedTurn.update({
    where: { id: next.id },
    data: { status: "running", startedAt: new Date() },
  });
  await emitQueue(claimed);
  return claimed;
}

export async function completeQueuedTurn(turnId: string, failed = false) {
  const turn = await prisma.queuedTurn.update({
    where: { id: turnId },
    data: { status: failed ? "failed" : "completed", completedAt: new Date() },
  });
  await emitQueue(turn);
  return turn;
}

async function emitQueue(turn: { id: string; userId: string; conversationId: string; status: string; position: number }) {
  await appendConversationEvent({
    userId: turn.userId,
    conversationId: turn.conversationId,
    type: "queue.updated",
    payload: { turnId: turn.id, status: turn.status, position: turn.position },
  });
}

async function assertConversation(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, userId } });
  if (!conversation) throw new AppError("NOT_FOUND", "会话不存在。", 404);
}
