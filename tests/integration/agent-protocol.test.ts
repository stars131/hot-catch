import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { parseChatMessageMetadata } from "@/lib/creator/chat-schemas";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userAId = "";
let userBId = "";
let conversationId = "";
let contentId = "";

beforeAll(async () => {
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `c1-a-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `c1-b-${runId}@example.com` } }),
  ]);
  userAId = userA.id;
  userBId = userB.id;
  const conversation = await prisma.conversation.create({
    data: { userId: userAId, title: `C1 协议测试 ${runId}` },
  });
  conversationId = conversation.id;
  const content = await prisma.generatedContent.create({
    data: {
      userId: userAId,
      platform: "xiaohongshu",
      contentKind: "xhs_graphic",
      title: `C1 内容 ${runId}`,
    },
  });
  contentId = content.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("Message clientMessageId 幂等", () => {
  it("同一 conversationId + clientMessageId 只创建一次", async () => {
    const clientMessageId = `cm-${runId}`;
    await prisma.message.create({
      data: { conversationId, role: "user", content: "第一次发送", clientMessageId },
    });

    await expect(
      prisma.message.create({
        data: { conversationId, role: "user", content: "重复发送", clientMessageId },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const rows = await prisma.message.findMany({
      where: { conversationId, clientMessageId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("第一次发送");
  });

  it("upsert 语义:重复请求返回已存在消息而不新建", async () => {
    const clientMessageId = `cm-upsert-${runId}`;
    const first = await prisma.message.upsert({
      where: {
        conversationId_clientMessageId: { conversationId, clientMessageId },
      },
      create: { conversationId, role: "user", content: "原始内容", clientMessageId },
      update: {},
    });
    const second = await prisma.message.upsert({
      where: {
        conversationId_clientMessageId: { conversationId, clientMessageId },
      },
      create: { conversationId, role: "user", content: "不应出现的内容", clientMessageId },
      update: {},
    });
    expect(second.id).toBe(first.id);
    expect(second.content).toBe("原始内容");
  });

  it("旧消息(clientMessageId 为 NULL)互不冲突", async () => {
    await prisma.message.create({
      data: { conversationId, role: "assistant", content: "旧消息一" },
    });
    await prisma.message.create({
      data: { conversationId, role: "assistant", content: "旧消息二" },
    });
    const nullRows = await prisma.message.findMany({
      where: { conversationId, clientMessageId: null },
    });
    expect(nullRows.length).toBeGreaterThanOrEqual(2);
  });
});

describe("旧 Message 数据可读性(complete / v1 默认值)", () => {
  it("绕过 Prisma 默认值直插旧形状行,读取时获得 complete / v1", async () => {
    const legacyId = `legacy-${runId}`;
    await prisma.$executeRaw`
      INSERT INTO "Message" ("id", "conversationId", "role", "content", "createdAt")
      VALUES (${legacyId}, ${conversationId}, 'assistant'::"MessageRole", '旧版纯文本消息', NOW())
    `;
    const legacy = await prisma.message.findUnique({ where: { id: legacyId } });
    expect(legacy).not.toBeNull();
    expect(legacy!.status).toBe("complete");
    expect(legacy!.protocolVersion).toBe(1);
    expect(legacy!.clientMessageId).toBeNull();
    expect(legacy!.content).toBe("旧版纯文本消息");
    expect(parseChatMessageMetadata(legacy!.metadata)).toBeNull();
  });
});

describe("ContentRevision.originJobId 防重复", () => {
  it("Worker 重试携带同一 originJobId 不会创建重复版本", async () => {
    const originJobId = `job-${runId}`;
    await prisma.contentRevision.create({
      data: {
        userId: userAId,
        contentId,
        revisionNumber: 1,
        source: "generated",
        title: "首次生成",
        checksum: `checksum-${runId}-1`,
        originJobId,
        provenance: { promptVersion: "v1", model: "deepseek-chat" },
      },
    });

    await expect(
      prisma.contentRevision.create({
        data: {
          userId: userAId,
          contentId,
          revisionNumber: 2,
          source: "generated",
          title: "重试生成",
          checksum: `checksum-${runId}-2`,
          originJobId,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    const rows = await prisma.contentRevision.findMany({ where: { originJobId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("首次生成");
  });
});

describe("AgentRun / ContentReference / ProcessingJob 跨用户隔离", () => {
  it("AgentRun 按 userId 过滤后另一用户不可见、不可更新", async () => {
    const run = await prisma.agentRun.create({
      data: {
        userId: userAId,
        conversationId,
        command: "content.generate",
        status: "running",
      },
    });

    const visibleToB = await prisma.agentRun.findFirst({
      where: { id: run.id, userId: userBId },
    });
    expect(visibleToB).toBeNull();

    const updatedAsB = await prisma.agentRun.updateMany({
      where: { id: run.id, userId: userBId },
      data: { status: "canceled" },
    });
    expect(updatedAsB.count).toBe(0);
    const reloaded = await prisma.agentRun.findUnique({ where: { id: run.id } });
    expect(reloaded!.status).toBe("running");
  });

  it("ContentReference 归属校验:B 查不到 A 的参考,也不能挂到 A 的内容上", async () => {
    const reference = await prisma.contentReference.create({
      data: {
        userId: userAId,
        contentId,
        role: "structure",
        sourceUrl: "https://www.xiaohongshu.com/explore/demo",
        fingerprint: `fp-${runId}`,
        snapshot: { summary: "结构摘要", evidence: [] },
      },
    });

    expect(
      await prisma.contentReference.findFirst({
        where: { id: reference.id, userId: userBId },
      }),
    ).toBeNull();

    // 服务层写入前必须先按 userId 校验内容归属;该查询对 B 必须为空。
    const contentOwnedByB = await prisma.generatedContent.findFirst({
      where: { id: contentId, userId: userBId },
    });
    expect(contentOwnedByB).toBeNull();

    // 同一 content + fingerprint + role 重复导入被唯一约束拦截。
    await expect(
      prisma.contentReference.create({
        data: {
          userId: userAId,
          contentId,
          role: "structure",
          fingerprint: `fp-${runId}`,
          snapshot: {},
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("挂在 AgentRun 下的 ProcessingJob 按 userId 过滤后对另一用户不可见", async () => {
    const run = await prisma.agentRun.create({
      data: { userId: userAId, conversationId, command: "reference.import" },
    });
    const parentJob = await prisma.processingJob.create({
      data: {
        userId: userAId,
        type: "ingest",
        queueName: "ingest",
        action: "reference.import",
        agentRunId: run.id,
        input: { url: "https://example.com/post" },
      },
    });
    const childJob = await prisma.processingJob.create({
      data: {
        userId: userAId,
        type: "analysis",
        queueName: "analysis",
        action: "reference.analyze",
        agentRunId: run.id,
        parentJobId: parentJob.id,
        input: {},
      },
    });

    const chainForA = await prisma.processingJob.findMany({
      where: { agentRunId: run.id, userId: userAId },
    });
    expect(chainForA).toHaveLength(2);
    expect(chainForA.map((job) => job.action).sort()).toEqual([
      "reference.analyze",
      "reference.import",
    ]);

    const chainForB = await prisma.processingJob.findMany({
      where: { agentRunId: run.id, userId: userBId },
    });
    expect(chainForB).toHaveLength(0);

    expect(
      await prisma.processingJob.findFirst({
        where: { id: childJob.id, userId: userBId },
      }),
    ).toBeNull();
  });
});
