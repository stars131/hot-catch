import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRedisConnection } from "@/lib/jobs/connection";
import {
  EVENT_PROTOCOL,
  type ConversationEventType,
  type StarEventEnvelope,
} from "@/lib/events/protocol";

const RETENTION_DAYS = 30;
const MAX_EVENTS_PER_CONVERSATION = 20_000;

export async function appendConversationEvent(input: {
  userId: string;
  conversationId: string;
  type: ConversationEventType;
  payload: Prisma.InputJsonValue;
  runId?: string;
  messageId?: string;
}) {
  const event = await prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.update({
      where: { id: input.conversationId, userId: input.userId },
      data: { lastEventSeq: { increment: 1 } },
      select: { lastEventSeq: true, streamEpoch: true },
    });
    return tx.conversationEvent.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        seq: conversation.lastEventSeq,
        streamEpoch: conversation.streamEpoch,
        type: input.type,
        payload: input.payload,
        runId: input.runId,
        messageId: input.messageId,
        retainedUntil: new Date(Date.now() + RETENTION_DAYS * 86_400_000),
      },
    });
  });

  void publishWakeup(input.conversationId, event.seq);
  if (event.seq % 500 === 0) void compactConversationEvents(input.conversationId);
  return toEnvelope(event);
}

export async function listConversationEvents(input: {
  userId: string;
  conversationId: string;
  afterSeq: number;
  limit?: number;
}) {
  return prisma.conversationEvent.findMany({
    where: {
      userId: input.userId,
      conversationId: input.conversationId,
      seq: { gt: input.afterSeq },
    },
    orderBy: { seq: "asc" },
    take: Math.min(input.limit ?? 250, 500),
  });
}

export async function getEventStreamState(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true, streamEpoch: true, lastEventSeq: true },
  });
  if (!conversation) return null;
  const oldest = await prisma.conversationEvent.findFirst({
    where: { conversationId },
    orderBy: { seq: "asc" },
    select: { seq: true },
  });
  return { ...conversation, oldestSeq: oldest?.seq ?? conversation.lastEventSeq + 1 };
}

export function toEnvelope(event: {
  conversationId: string;
  seq: number;
  streamEpoch: string;
  type: string;
  payload: Prisma.JsonValue;
  createdAt: Date;
}): StarEventEnvelope {
  return {
    protocol: EVENT_PROTOCOL,
    conversationId: event.conversationId,
    seq: event.seq,
    streamEpoch: event.streamEpoch,
    type: event.type as ConversationEventType,
    payload: event.payload,
    createdAt: event.createdAt.toISOString(),
  };
}

async function publishWakeup(conversationId: string, seq: number) {
  try {
    await getRedisConnection().publish(`startrace:conversation:${conversationId}`, String(seq));
  } catch {
    // Redis is only a wake-up hint. SSE always catches up from PostgreSQL.
  }
}

export async function compactConversationEvents(conversationId: string) {
  const count = await prisma.conversationEvent.count({ where: { conversationId } });
  if (count <= MAX_EVENTS_PER_CONVERSATION) {
    await prisma.conversationEvent.deleteMany({
      where: { conversationId, retainedUntil: { lt: new Date() } },
    });
    return;
  }

  const cutoff = await prisma.conversationEvent.findMany({
    where: { conversationId },
    orderBy: { seq: "desc" },
    skip: MAX_EVENTS_PER_CONVERSATION - 1,
    take: 1,
    select: { seq: true },
  });
  if (!cutoff[0]) return;
  await prisma.$transaction([
    prisma.conversationEvent.deleteMany({
      where: { conversationId, seq: { lt: cutoff[0].seq } },
    }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { streamEpoch: crypto.randomUUID() },
    }),
  ]);
}
