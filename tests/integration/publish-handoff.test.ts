import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { handleUserMessage, invokeCardAction } from "@/lib/creator/agent-service";
import {
  buildPublishReadinessReply,
  getAiToEarnConnectionState,
} from "@/lib/creator/publish-handoff";
import {
  CHAT_PROTOCOL,
  type ChatCard,
  type PublishReadinessCard,
} from "@/lib/creator/chat-protocol";
import { parseChatMessageMetadata } from "@/lib/creator/chat-schemas";

/**
 * C8 发布确认与移交集成测试。
 *
 * 覆盖:publishTarget 消息生成就绪卡、纯文本发布意图、凭证缺失/失效的显式连接状态、
 * 阻塞内容不提供确认动作、确认幂等(重复确认不重复移交)、过期版本安全拦截、
 * 确认后重新校验阻塞、跨用户越权、全程不创建 PublishRecord(不接真实供应商)。
 */

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let userAId = "";
let userBId = "";
let convAId = "";

const XHS_STRUCTURED = {
  pages: [
    { pageNumber: 1, heading: "开场", body: "为什么要复盘面试。" },
    { pageNumber: 2, heading: "方法", body: "复盘的三个步骤。" },
  ],
  tags: ["求职", "复盘", "面试"],
  riskNotes: [],
};

async function seedContent(params: {
  userId: string;
  conversationId?: string;
  title?: string | null;
  bodyText?: string;
  withRevision?: boolean;
  tag?: string;
}) {
  const content = await prisma.generatedContent.create({
    data: {
      userId: params.userId,
      conversationId: params.conversationId,
      platform: "xiaohongshu",
      contentKind: "xhs_graphic",
      outputType: "xhs_graphic",
      title: params.title === undefined ? "AI 面试复盘三步法" : params.title,
      tags: ["求职"],
      status: "saved",
    },
  });
  if (params.withRevision === false) return { content, revision: null };
  const revision = await prisma.contentRevision.create({
    data: {
      userId: params.userId,
      contentId: content.id,
      revisionNumber: 1,
      source: "generated",
      title: params.title === undefined ? "AI 面试复盘三步法" : params.title,
      bodyText:
        params.bodyText ?? "面试完不复盘,同样的问题会再犯一遍。".repeat(5),
      structuredContent: XHS_STRUCTURED,
      checksum: `c8-${params.tag ?? "seed"}-${runId}-${content.id.slice(-6)}`,
    },
  });
  return { content, revision };
}

function readinessCardOf(metadata: unknown): PublishReadinessCard {
  const cards = parseChatMessageMetadata(metadata)?.cards ?? [];
  const card = cards.find(
    (item): item is PublishReadinessCard => item.type === "publish_readiness",
  );
  expect(card).toBeTruthy();
  return card!;
}

async function seedReadinessCardMessage(conversationId: string, card: ChatCard) {
  return prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content: "发布就绪检查",
      status: "complete",
      metadata: { protocol: CHAT_PROTOCOL, cards: [card] },
    },
  });
}

beforeAll(async () => {
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `c8-a-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `c8-b-${runId}@example.com` } }),
  ]);
  userAId = userA.id;
  userBId = userB.id;
  const conversation = await prisma.conversation.create({
    data: { userId: userAId, title: `C8 发布确认 ${runId}` },
  });
  convAId = conversation.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("publishTarget 消息与就绪卡", () => {
  it("凭证缺失时:就绪卡给出显式连接状态与连接动作,不假成功", async () => {
    const { content } = await seedContent({ userId: userAId, conversationId: convAId, tag: "prep" });
    const result = await handleUserMessage({
      userId: userAId,
      conversationId: convAId,
      text: "准备发布《AI 面试复盘三步法》",
      clientMessageId: `cm-pub-${runId}`,
      publishTarget: { contentId: content.id },
    });
    expect(result.assistantMessage!.status).toBe("complete");
    expect(result.run!.command).toBe("publish.prepare");

    const card = readinessCardOf(result.assistantMessage!.metadata);
    expect(card.contentId).toBe(content.id);
    expect(card.revisionNumber).toBe(1);
    expect(card.connection).toBe("missing");
    expect(card.state).toBe("warnings");
    const connectionItem = card.items.find((item) => item.key === "connection.aitoearn");
    expect(connectionItem?.level).toBe("warn");
    expect(connectionItem?.detail).toContain("尚未配置 AiToEarn 凭证");
    expect(card.actions.map((action) => action.actionId)).toContain("connection.open");
    // 就绪检查不创建发布记录
    expect(await prisma.publishRecord.count({ where: { contentId: content.id } })).toBe(0);
  });

  it("凭证失效时连接状态为 invalid;有效时为 connected 且内容完备可 ready", async () => {
    await prisma.providerCredential.create({
      data: {
        userId: userAId,
        provider: "aitoearn",
        encryptedPayload: "test-cipher",
        status: "invalid",
      },
    });
    expect(await getAiToEarnConnectionState(userAId)).toBe("invalid");

    await prisma.providerCredential.update({
      where: { userId_provider: { userId: userAId, provider: "aitoearn" } },
      data: { status: "active" },
    });
    const { content } = await seedContent({ userId: userAId, tag: "ready" });
    const reply = await buildPublishReadinessReply({
      userId: userAId,
      contentId: content.id,
      cardIdSuffix: `t-${runId.slice(-6)}`,
    });
    const card = reply.cards.find(
      (item): item is PublishReadinessCard => item.type === "publish_readiness",
    )!;
    expect(card.connection).toBe("connected");
    expect(card.state).toBe("ready");
    expect(card.actions.map((action) => action.actionId)).toContain(
      "publish.confirm_handoff",
    );
    // 清理凭证,后续用例回到「未连接」基线
    await prisma.providerCredential.deleteMany({ where: { userId: userAId } });
  });

  it("阻塞内容(空字符串标题)不提供确认动作;无版本内容给出指引", async () => {
    const { content: blocked } = await seedContent({
      userId: userAId,
      title: "",
      tag: "blocked",
    });
    const blockedReply = await buildPublishReadinessReply({
      userId: userAId,
      contentId: blocked.id,
      cardIdSuffix: `b-${runId.slice(-6)}`,
    });
    const blockedCard = blockedReply.cards.find(
      (item): item is PublishReadinessCard => item.type === "publish_readiness",
    )!;
    expect(blockedCard.state).toBe("blocked");
    expect(
      blockedCard.actions.map((action) => action.actionId),
    ).not.toContain("publish.confirm_handoff");

    const { content: empty } = await seedContent({
      userId: userAId,
      withRevision: false,
      tag: "norev",
    });
    const emptyReply = await buildPublishReadinessReply({
      userId: userAId,
      contentId: empty.id,
      cardIdSuffix: `n-${runId.slice(-6)}`,
    });
    expect(emptyReply.cards.some((item) => item.type === "publish_readiness")).toBe(false);
    expect(emptyReply.text).toContain("还没有任何已保存版本");
  });

  it("在途发布记录会以提醒项出现,防止重复提交", async () => {
    const { content, revision } = await seedContent({ userId: userAId, tag: "inflight" });
    await prisma.publishRecord.create({
      data: {
        userId: userAId,
        contentId: content.id,
        revisionId: revision!.id,
        platform: "xiaohongshu",
        status: "awaiting_user",
        idempotencyKey: `c8-inflight-${runId}`,
      },
    });
    const reply = await buildPublishReadinessReply({
      userId: userAId,
      contentId: content.id,
      cardIdSuffix: `f-${runId.slice(-6)}`,
    });
    const card = reply.cards.find(
      (item): item is PublishReadinessCard => item.type === "publish_readiness",
    )!;
    const inflight = card.items.find((item) => item.key === "publish.inflight");
    expect(inflight?.level).toBe("warn");
    expect(inflight?.detail).toContain("等待你在抖音确认");
  });

  it("纯文本发布意图:会话内有内容则出就绪卡,无内容给指引;不劫持普通消息", async () => {
    const conversation = await prisma.conversation.create({
      data: { userId: userAId, title: `C8 意图 ${runId}` },
    });
    const noContent = await handleUserMessage({
      userId: userAId,
      conversationId: conversation.id,
      text: "准备发布",
      clientMessageId: `cm-intent-none-${runId}`,
    });
    expect(noContent.assistantMessage!.content).toContain("还没有可发布的正式内容");

    await seedContent({ userId: userAId, conversationId: conversation.id, tag: "intent" });
    const withContent = await handleUserMessage({
      userId: userAId,
      conversationId: conversation.id,
      text: "帮我准备发布这篇内容",
      clientMessageId: `cm-intent-hit-${runId}`,
    });
    expect(
      parseChatMessageMetadata(withContent.assistantMessage!.metadata)?.cards.some(
        (card) => card.type === "publish_readiness",
      ),
    ).toBe(true);

    // 普通创作消息不被发布意图劫持(含「发布会」也不触发)
    const normal = await handleUserMessage({
      userId: userAId,
      conversationId: conversation.id,
      text: "帮我写一篇关于新品发布会的小红书图文,注意开场要抓人",
      clientMessageId: `cm-intent-miss-${runId}`,
    });
    expect(
      parseChatMessageMetadata(normal.assistantMessage!.metadata)?.cards.some(
        (card) => card.type === "publish_readiness",
      ) ?? false,
    ).toBe(false);
  });
});

describe("确认移交:幂等、过期拦截与重新校验", () => {
  it("确认产生移交结果与发布中心入口;重复确认返回首次结果;不创建发布记录", async () => {
    const { content } = await seedContent({ userId: userAId, conversationId: convAId, tag: "confirm" });
    const reply = await buildPublishReadinessReply({
      userId: userAId,
      contentId: content.id,
      cardIdSuffix: `c-${runId.slice(-6)}`,
    });
    const card = reply.cards[0] as PublishReadinessCard;
    const source = await seedReadinessCardMessage(convAId, card);

    const first = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId: `ca-confirm-1-${runId}`,
      sourceMessageId: source.id,
      cardId: card.id,
      actionId: "publish.confirm_handoff",
    });
    expect(first.replayed).toBe(false);
    expect(first.resultMessage.content).toContain("移交到发布中心");
    expect(first.resultMessage.content).toContain("不会自动发布");
    const notices = parseChatMessageMetadata(first.resultMessage.metadata)?.cards ?? [];
    const notice = notices.find((item) => item.type === "notice");
    expect(notice && notice.type === "notice" ? notice.reference : null).toEqual({
      type: "content",
      id: content.id,
    });
    expect(
      notice && notice.type === "notice"
        ? notice.actions?.map((action) => action.actionId)
        : [],
    ).toContain("publish.open_workspace");

    // 重复确认(新的 clientActionId):幂等返回首次结果,不重复移交
    const replay = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId: `ca-confirm-2-${runId}`,
      sourceMessageId: source.id,
      cardId: card.id,
      actionId: "publish.confirm_handoff",
    });
    expect(replay.replayed).toBe(true);
    expect(replay.resultMessage.id).toBe(first.resultMessage.id);

    // 全程没有创建任何发布记录,也没有调用供应商
    expect(await prisma.publishRecord.count({ where: { contentId: content.id } })).toBe(0);
  });

  it("就绪卡基于的版本过期时确认被安全拦截", async () => {
    const { content } = await seedContent({ userId: userAId, conversationId: convAId, tag: "stale" });
    const reply = await buildPublishReadinessReply({
      userId: userAId,
      contentId: content.id,
      cardIdSuffix: `s-${runId.slice(-6)}`,
    });
    const card = reply.cards[0] as PublishReadinessCard;
    const source = await seedReadinessCardMessage(convAId, card);

    // 卡片生成后内容又保存了新版本
    await prisma.contentRevision.create({
      data: {
        userId: userAId,
        contentId: content.id,
        revisionNumber: 2,
        source: "manual",
        title: "AI 面试复盘三步法(修订)",
        bodyText: "更新后的正文。".repeat(10),
        structuredContent: XHS_STRUCTURED,
        checksum: `c8-stale-v2-${runId}`,
      },
    });

    const result = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId: `ca-stale-${runId}`,
      sourceMessageId: source.id,
      cardId: card.id,
      actionId: "publish.confirm_handoff",
    });
    expect(result.resultMessage.content).toContain("没有移交");
    expect(result.resultMessage.content).toContain("v2");
    expect(await prisma.publishRecord.count({ where: { contentId: content.id } })).toBe(0);
  });

  it("确认时重新校验:内容退化为阻塞后即使卡上有确认动作也拒绝移交", async () => {
    const { content } = await seedContent({ userId: userAId, conversationId: convAId, tag: "reblock" });
    const reply = await buildPublishReadinessReply({
      userId: userAId,
      contentId: content.id,
      cardIdSuffix: `r-${runId.slice(-6)}`,
    });
    const card = reply.cards[0] as PublishReadinessCard;
    // 卡片生成后,最新版本被替换为空标题(同一 revision 记录被直接修改,revisionId 不变)
    await prisma.contentRevision.update({
      where: { id: card.revisionId },
      data: { title: "", bodyText: "" },
    });
    const source = await seedReadinessCardMessage(convAId, card);

    const result = await invokeCardAction({
      userId: userAId,
      conversationId: convAId,
      clientActionId: `ca-reblock-${runId}`,
      sourceMessageId: source.id,
      cardId: card.id,
      actionId: "publish.confirm_handoff",
    });
    expect(result.resultMessage.content).toContain("阻塞");
    expect(result.resultMessage.content).toContain("没有移交");
  });
});

describe("跨用户越权", () => {
  it("B 无法对指向 A 内容的就绪卡执行准备或确认(即使卡在 B 自己的会话里)", async () => {
    const { content } = await seedContent({ userId: userAId, tag: "hijack" });
    const reply = await buildPublishReadinessReply({
      userId: userAId,
      contentId: content.id,
      cardIdSuffix: `h-${runId.slice(-6)}`,
    });
    const card = reply.cards[0] as PublishReadinessCard;
    const convB = await prisma.conversation.create({
      data: { userId: userBId, title: `C8 B 会话 ${runId}` },
    });
    // 模拟被篡改/伪造的卡片元数据落在 B 的会话里
    const forged = await seedReadinessCardMessage(convB.id, card);

    await expect(
      invokeCardAction({
        userId: userBId,
        conversationId: convB.id,
        clientActionId: `ca-hijack-c-${runId}`,
        sourceMessageId: forged.id,
        cardId: card.id,
        actionId: "publish.confirm_handoff",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      invokeCardAction({
        userId: userBId,
        conversationId: convB.id,
        clientActionId: `ca-hijack-p-${runId}`,
        sourceMessageId: forged.id,
        cardId: card.id,
        actionId: "publish.prepare",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // B 也无法用 publishTarget 消息评估 A 的内容
    const attempt = await handleUserMessage({
      userId: userBId,
      conversationId: convB.id,
      text: "准备发布《别人的内容》",
      clientMessageId: `cm-hijack-${runId}`,
      publishTarget: { contentId: content.id },
    });
    expect(attempt.assistantMessage!.status).toBe("failed");
    expect(attempt.assistantMessage!.content).toContain("不属于当前账号");
  });
});
