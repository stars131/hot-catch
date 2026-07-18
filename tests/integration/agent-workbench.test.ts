import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { appendConversationEvent, listConversationEvents } from "@/lib/events/event-service";
import { createConversationContextVersion } from "@/lib/services/conversation-context-service";
import { createMemoryCandidate, reviewMemory } from "@/lib/services/memory-service";
import { activatePersona, createPersonaVersion } from "@/lib/services/persona-service";
import { createManualSocialConnection, syncAuthorizedAccounts, updateSocialConnection } from "@/lib/services/social-connection-service";
import { enqueueTurn } from "@/lib/services/queue-service";
import { drainQueuedTurns, listConversationMessages } from "@/lib/creator/agent-service";

const runId = crypto.randomUUID();
const emailA = `agent-a-${runId}@example.test`;
const emailB = `agent-b-${runId}@example.test`;
let userA: string;
let userB: string;
let conversationId: string;

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.user.create({ data: { email: emailA, name: "Agent A" } }),
    prisma.user.create({ data: { email: emailB, name: "Agent B" } }),
  ]);
  userA = a.id; userB = b.id;
  conversationId = (await prisma.conversation.create({ data: { userId: userA, title: "Agent workbench test" } })).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
  await prisma.$disconnect();
});

describe("cloud agent workbench integration", () => {
  it("merges a matching manual account into the authorized source", async () => {
    const manual = await createManualSocialConnection(userA, { platform: "xiaohongshu", displayName: "同名账号", handle: "same", isDefault: true });
    const [synced] = await syncAuthorizedAccounts(userA, [{ id: `provider-${runId}`, platform: "xiaohongshu", name: "同名账号", status: "active", raw: { fixture: true } }], "aitoearn");
    expect(synced.id).toBe(manual.id);
    expect(synced.source).toBe("authorized");
    expect(synced.externalAccountId).toBe(`provider-${runId}`);
  });

  it("keeps one active persona per account and immutable context snapshots", async () => {
    const account = await prisma.socialConnection.findFirstOrThrow({ where: { userId: userA } });
    const first = await createPersonaVersion(userA, { name: "第一版", socialConnectionId: account.id, status: "active", contentStyle: "简洁" });
    const second = await createPersonaVersion(userA, { name: "第二版", socialConnectionId: account.id, status: "draft", previousVersionId: first.id, contentStyle: "具体" });
    await activatePersona(userA, second.id);
    expect((await prisma.persona.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("archived");

    const context = await createConversationContextVersion({ userId: userA, conversationId, accountBindings: { xiaohongshu: account.id }, targetPlatforms: ["xiaohongshu"], contentLocale: "zh-CN", skills: [] });
    await prisma.persona.update({ where: { id: second.id }, data: { contentStyle: "后来修改" } });
    expect(JSON.stringify(context.personaSnapshot)).toContain("具体");
    expect(JSON.stringify(context.personaSnapshot)).not.toContain("后来修改");

    await expect(createConversationContextVersion({ userId: userB, conversationId, accountBindings: { xiaohongshu: account.id }, targetPlatforms: ["xiaohongshu"], contentLocale: "zh-CN", skills: [] })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allocates contiguous event sequences and reviews memory candidates", async () => {
    await Promise.all(Array.from({ length: 6 }, (_, index) => appendConversationEvent({ userId: userA, conversationId, type: "job.updated", payload: { jobId: `job-${index}`, status: "running" } })));
    const events = await listConversationEvents({ userId: userA, conversationId, afterSeq: 0 });
    expect(events.map((event) => event.seq)).toEqual(Array.from({ length: 6 }, (_, index) => index + 1));

    const memory = await createMemoryCandidate({ userId: userA, kind: "expression", title: "开头偏好", body: "以后写开头时先给出一个具体场景，再说明读者可以获得的实际收益。", sourceType: "integration_test", confidence: 0.8 });
    expect(memory?.status).toBe("candidate");
    const approved = await reviewMemory({ userId: userA, memoryId: memory!.id, action: "accept" });
    expect(approved.status).toBe("approved");
    expect(await prisma.memoryAudit.count({ where: { memoryId: memory!.id } })).toBe(1);
  });

  it("merges persona versions without active collisions", async () => {
    const source = await createManualSocialConnection(userA, { platform: "douyin", displayName: "来源账号" });
    const target = await createManualSocialConnection(userA, { platform: "douyin", displayName: "目标账号" });
    await createPersonaVersion(userA, { name: "来源人设", socialConnectionId: source.id, status: "active" });
    await createPersonaVersion(userA, { name: "目标人设", socialConnectionId: target.id, status: "active" });

    await updateSocialConnection(userA, { action: "merge", id: source.id, targetConnectionId: target.id });

    const personas = await prisma.persona.findMany({
      where: { socialConnectionId: target.id },
      orderBy: { version: "asc" },
    });
    expect(new Set(personas.map((persona) => persona.version)).size).toBe(personas.length);
    expect(personas.filter((persona) => persona.status === "active")).toHaveLength(1);
  });

  it("drains queued turns in position order after a run completes", async () => {
    const blockingRun = await prisma.agentRun.create({
      data: { userId: userA, conversationId, status: "running", command: "chat.reply", startedAt: new Date() },
    });
    await enqueueTurn({ userId: userA, conversationId, clientTurnId: `queued-1-${runId}`, content: "第一条排队消息" });
    await enqueueTurn({ userId: userA, conversationId, clientTurnId: `queued-2-${runId}`, content: "第二条排队消息" });
    await prisma.agentRun.update({ where: { id: blockingRun.id }, data: { status: "completed", completedAt: new Date() } });

    expect(await drainQueuedTurns(userA, conversationId)).toBe(2);
    const turns = await prisma.queuedTurn.findMany({
      where: { conversationId, clientTurnId: { startsWith: "queued-" } },
      orderBy: { position: "asc" },
    });
    expect(turns.map((turn) => turn.status)).toEqual(["completed", "completed"]);
    const messages = await prisma.message.findMany({
      where: { conversationId, clientMessageId: { in: turns.map((turn) => turn.clientTurnId) } },
      orderBy: { createdAt: "asc" },
    });
    expect(messages.map((message) => message.content)).toEqual(["第一条排队消息", "第二条排队消息"]);
  });

  it("loads and orders a 5,000-message virtualized conversation window", async () => {
    const longConversation = await prisma.conversation.create({
      data: { userId: userA, title: "5k history" },
    });
    const startedAt = Date.now();
    await prisma.message.createMany({
      data: Array.from({ length: 5_000 }, (_, index) => ({
        conversationId: longConversation.id,
        role: index % 2 ? "assistant" : "user",
        content: `message-${String(index).padStart(4, "0")}`,
        status: "complete",
        createdAt: new Date(1_700_000_000_000 + index),
      })),
    });
    const result = await listConversationMessages({ userId: userA, conversationId: longConversation.id });
    expect(result.messages).toHaveLength(5_000);
    expect(result.messages[0].content).toBe("message-0000");
    expect(result.messages.at(-1)?.content).toBe("message-4999");
    expect(Date.now() - startedAt).toBeLessThan(10_000);
  });
});
