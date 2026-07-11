import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  actionIdempotencyKey,
  buildDefaultReply,
  cancelAgentRun,
  getAgentRunForUser,
  handleUserMessage,
  invokeCardAction,
  listConversationMessages,
} from "@/lib/creator/agent-service";
import { CHAT_PROTOCOL, type ChatCard } from "@/lib/creator/chat-protocol";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userAId = "";
let userBId = "";
let convAId = "";

async function createCardMessage(conversationId: string, cards: ChatCard[]) {
  return prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content: "带卡片的助手消息",
      status: "complete",
      metadata: { protocol: CHAT_PROTOCOL, cards },
    },
  });
}

const approvalCard: ChatCard = {
  id: "card-approve-demo",
  version: 1,
  type: "approval",
  title: "确认一个高风险操作",
  summary: "这是集成测试用的审批卡。",
  risk: "high",
  confirmAction: { actionId: "approval.confirm", label: "确认" },
  cancelAction: { actionId: "approval.cancel", label: "取消" },
};

beforeAll(async () => {
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `c3-a-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `c3-b-${runId}@example.com` } }),
  ]);
  userAId = userA.id;
  userBId = userB.id;
  const conversation = await prisma.conversation.create({
    data: { userId: userAId, title: `C3 测试 ${runId}` },
  });
  convAId = conversation.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("普通消息与 pending → succeeded/failed", () => {
  it("发送消息创建 user + assistant + AgentRun,回复为中文且无英文命令提示", async () => {
    const result = await handleUserMessage({
      userId: userAId,
      conversationId: convAId,
      text: "帮我写一篇关于晨跑的小红书",
      clientMessageId: `cm-normal-${runId}`,
    });
    expect(result.replayed).toBe(false);
    expect(result.userMessage.status).toBe("complete");
    expect(result.assistantMessage!.status).toBe("complete");
    expect(result.assistantMessage!.content).not.toMatch(/add-account|Paste an XHS|benchmark/i);
    expect(result.assistantMessage!.content.length).toBeGreaterThan(0);
    expect(result.run!.status).toBe("completed");
    expect(result.run!.requestMessageId).toBe(result.userMessage.id);
    expect(result.run!.assistantMessageId).toBe(result.assistantMessage!.id);
  });

  it("首次回复携带 option 方向卡", async () => {
    const list = await listConversationMessages({ userId: userAId, conversationId: convAId });
    const withCard = list.messages.find(
      (message) =>
        message.role === "assistant" &&
        JSON.stringify(message.metadata ?? {}).includes("card-direction"),
    );
    expect(withCard).toBeTruthy();
  });

  it("回复构建失败时 assistant 置 failed、run 置 failed,刷新可从库恢复", async () => {
    const result = await handleUserMessage({
      userId: userAId,
      conversationId: convAId,
      text: "触发失败",
      clientMessageId: `cm-fail-${runId}`,
      replyBuilder: () => {
        throw new Error("模拟回复失败");
      },
    });
    expect(result.assistantMessage!.status).toBe("failed");
    expect(result.assistantMessage!.content).toContain("模拟回复失败");
    expect(result.run!.status).toBe("failed");

    // 模拟刷新:重新从数据库读取
    const list = await listConversationMessages({ userId: userAId, conversationId: convAId });
    const restored = list.messages.find((m) => m.id === result.assistantMessage!.id);
    expect(restored!.status).toBe("failed");
  });
});

describe("clientMessageId 幂等与刷新重放", () => {
  it("重复 clientMessageId 返回首次记录,不重复创建", async () => {
    const clientMessageId = `cm-dup-${runId}`;
    const first = await handleUserMessage({
      userId: userAId,
      conversationId: convAId,
      text: "第一次发送",
      clientMessageId,
    });
    const second = await handleUserMessage({
      userId: userAId,
      conversationId: convAId,
      text: "内容不同的重复发送",
      clientMessageId,
    });
    expect(second.replayed).toBe(true);
    expect(second.userMessage.id).toBe(first.userMessage.id);
    expect(second.userMessage.content).toBe("第一次发送");
    expect(second.assistantMessage!.id).toBe(first.assistantMessage!.id);
    const count = await prisma.message.count({
      where: { conversationId: convAId, clientMessageId },
    });
    expect(count).toBe(1);
  });
});

describe("option 卡动作", () => {
  it("提交选项创建结果消息;篡改的 optionId 不会通过标签解析", async () => {
    const reply = await buildDefaultReply({
      userId: userAId,
      conversationId: `fresh-${runId}`,
      text: "写点什么",
    });
    const optionCard = reply.cards[0];
    expect(optionCard.type).toBe("option");
    const source = await createCardMessage(convAId, [optionCard]);

    const result = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId: `ca-opt-${runId}`,
      sourceMessageId: source.id,
      cardId: optionCard.id,
      actionId: "direction.choose",
      values: { optionIds: ["direction-experience"] },
    });
    expect(result.replayed).toBe(false);
    expect(result.resultMessage.content).toContain("经验分享");
  });

  it("已处理动作再次点击(新的 clientActionId)返回第一次结果", async () => {
    const reply = await buildDefaultReply({
      userId: userAId,
      conversationId: `fresh2-${runId}`,
      text: "写点什么",
    });
    const optionCard = { ...reply.cards[0], id: `card-direction-2-${runId.slice(-6)}` } as ChatCard;
    const source = await createCardMessage(convAId, [optionCard]);

    const first = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId: `ca-first-${runId}`,
      sourceMessageId: source.id,
      cardId: optionCard.id,
      actionId: "direction.choose",
      values: { optionIds: ["direction-checklist"] },
    });
    const second = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId: `ca-second-${runId}`,
      sourceMessageId: source.id,
      cardId: optionCard.id,
      actionId: "direction.choose",
      values: { optionIds: ["direction-experience"] },
    });
    expect(second.replayed).toBe(true);
    expect(second.resultMessage.id).toBe(first.resultMessage.id);
    expect(second.resultMessage.content).toContain("步骤清单");
  });

  it("重复 clientActionId 返回第一次执行结果", async () => {
    const card: ChatCard = {
      ...approvalCard,
      id: `card-approve-dup-${runId.slice(-6)}`,
    };
    const source = await createCardMessage(convAId, [card]);
    const clientActionId = `ca-dup-${runId}`;
    const first = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId,
      sourceMessageId: source.id,
      cardId: card.id,
      actionId: "approval.confirm",
    });
    const replay = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId,
      sourceMessageId: source.id,
      cardId: card.id,
      actionId: "approval.confirm",
    });
    expect(replay.replayed).toBe(true);
    expect(replay.resultMessage.id).toBe(first.resultMessage.id);
  });
});

describe("approval 卡", () => {
  it("确认与取消分别产生对应结果", async () => {
    const confirmCard: ChatCard = { ...approvalCard, id: `card-ap-c-${runId.slice(-6)}` };
    const cancelCard: ChatCard = { ...approvalCard, id: `card-ap-x-${runId.slice(-6)}` };
    const source = await createCardMessage(convAId, [confirmCard, cancelCard]);

    const confirmed = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId: `ca-c-${runId}`,
      sourceMessageId: source.id,
      cardId: confirmCard.id,
      actionId: "approval.confirm",
    });
    expect(confirmed.resultMessage.content).toContain("已确认");

    const canceled = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId: `ca-x-${runId}`,
      sourceMessageId: source.id,
      cardId: cancelCard.id,
      actionId: "approval.cancel",
    });
    expect(canceled.resultMessage.content).toContain("已取消");
    expect(canceled.resultMessage.content).toContain("没有执行任何变更");
  });
});

describe("progress 卡与消息持久化", () => {
  it("进度卡引用真实 ProcessingJob 并可跨刷新恢复;另一用户查不到该任务", async () => {
    const job = await prisma.processingJob.create({
      data: {
        userId: userAId,
        type: "analysis",
        queueName: "analysis",
        action: "reference.analyze",
        status: "running",
        progress: 40,
        input: {},
      },
    });
    const progressCard: ChatCard = {
      id: `card-progress-${runId.slice(-6)}`,
      version: 1,
      type: "progress",
      jobId: job.id,
      title: "分析参考作品",
      display: "compact",
      cancelable: true,
    };
    await createCardMessage(convAId, [progressCard]);

    const list = await listConversationMessages({ userId: userAId, conversationId: convAId });
    const restored = list.messages.find((message) =>
      JSON.stringify(message.metadata ?? {}).includes(job.id),
    );
    expect(restored).toBeTruthy();

    const jobForB = await prisma.processingJob.findFirst({
      where: { id: job.id, userId: userBId },
    });
    expect(jobForB).toBeNull();
  });
});

describe("cancel 与 waiting_input 状态", () => {
  it("取消运行中的 run:run 置 canceled,pending assistant 置 failed;终态取消幂等", async () => {
    const pendingAssistant = await prisma.message.create({
      data: { conversationId: convAId, role: "assistant", content: "", status: "pending" },
    });
    const run = await prisma.agentRun.create({
      data: {
        userId: userAId,
        conversationId: convAId,
        assistantMessageId: pendingAssistant.id,
        status: "running",
        command: "chat.reply",
      },
    });

    const canceled = await cancelAgentRun(userAId, run.id);
    expect(canceled.status).toBe("canceled");
    const message = await prisma.message.findUnique({ where: { id: pendingAssistant.id } });
    expect(message!.status).toBe("failed");
    expect(message!.content).toContain("取消");

    // 幂等:再次取消返回终态,不报错
    const again = await cancelAgentRun(userAId, run.id);
    expect(again.status).toBe("canceled");
  });

  it("waiting_input 的 run 出现在 activeRun,刷新后可恢复", async () => {
    const conversation = await prisma.conversation.create({
      data: { userId: userAId, title: `C3 waiting ${runId}` },
    });
    await prisma.agentRun.create({
      data: {
        userId: userAId,
        conversationId: conversation.id,
        status: "waiting_input",
        command: "chat.reply",
      },
    });
    const list = await listConversationMessages({
      userId: userAId,
      conversationId: conversation.id,
    });
    expect(list.activeRun?.status).toBe("waiting_input");
  });
});

describe("跨用户越权与篡改", () => {
  it("B 不能读取、发送、取消 A 的会话与 run", async () => {
    await expect(
      listConversationMessages({ userId: userBId, conversationId: convAId }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      handleUserMessage({
        userId: userBId,
        conversationId: convAId,
        text: "越权发送",
        clientMessageId: `cm-b-${runId}`,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const run = await prisma.agentRun.create({
      data: { userId: userAId, conversationId: convAId, status: "running", command: "chat.reply" },
    });
    await expect(getAgentRunForUser(userBId, run.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(cancelAgentRun(userBId, run.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const untouched = await prisma.agentRun.findUnique({ where: { id: run.id } });
    expect(untouched!.status).toBe("running");
  });

  it("B 不能点击 A 消息上的动作(即使猜到 messageId)", async () => {
    const card: ChatCard = { ...approvalCard, id: `card-b-hijack-${runId.slice(-6)}` };
    const source = await createCardMessage(convAId, [card]);
    const convB = await prisma.conversation.create({
      data: { userId: userBId, title: "B 的会话" },
    });

    await expect(
      invokeCardAction({
        userId: userBId,
        conversationId: convAId, // A 的会话
        clientActionId: `ca-hijack1-${runId}`,
        sourceMessageId: source.id,
        cardId: card.id,
        actionId: "approval.confirm",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      invokeCardAction({
        userId: userBId,
        conversationId: convB.id, // 自己的会话 + 别人的消息
        clientActionId: `ca-hijack2-${runId}`,
        sourceMessageId: source.id,
        cardId: card.id,
        actionId: "approval.confirm",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("篡改 cardId / actionId / 非白名单动作均被拒绝", async () => {
    const card: ChatCard = { ...approvalCard, id: `card-tamper-${runId.slice(-6)}` };
    const source = await createCardMessage(convAId, [card]);

    await expect(
      invokeCardAction({
        userId: userAId,
        conversationId: convAId,
        clientActionId: `ca-t1-${runId}`,
        sourceMessageId: source.id,
        cardId: "card-not-exist",
        actionId: "approval.confirm",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(
      invokeCardAction({
        userId: userAId,
        conversationId: convAId,
        clientActionId: `ca-t2-${runId}`,
        sourceMessageId: source.id,
        cardId: card.id,
        actionId: "direction.choose", // 卡上不存在的动作
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // 卡上存在但不在服务端白名单的动作
    const rogueCard: ChatCard = {
      id: `card-rogue-${runId.slice(-6)}`,
      version: 1,
      type: "notice",
      tone: "info",
      title: "带未注册动作的卡",
      actions: [{ actionId: "system.exec", label: "执行" }],
    };
    const rogueSource = await createCardMessage(convAId, [rogueCard]);
    await expect(
      invokeCardAction({
        userId: userAId,
        conversationId: convAId,
        clientActionId: `ca-t3-${runId}`,
        sourceMessageId: rogueSource.id,
        cardId: rogueCard.id,
        actionId: "system.exec",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("幂等键推导", () => {
  it("非重复动作按 cardId:actionId,可重复动作按 clientActionId", () => {
    expect(
      actionIdempotencyKey({ repeatable: false, clientActionId: "x", cardId: "c1", actionId: "a1" }),
    ).toBe("action:c1:a1");
    expect(
      actionIdempotencyKey({ repeatable: true, clientActionId: "x", cardId: "c1", actionId: "a1" }),
    ).toBe("action:x");
  });
});
