import { Prisma, JobType } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { resolveSelectedSkills } from "@/lib/services/skill-service";
import { AppError } from "@/lib/errors";
import { CHAT_PROTOCOL, type ChatCard, type CardAction } from "@/lib/creator/chat-protocol";
import {
  chatMessageMetadataV1Schema,
  parseChatMessageMetadata,
  type PatchTarget,
  type PublishTarget,
} from "@/lib/creator/chat-schemas";
import { getActionHandler, type ActionResult } from "@/lib/creator/action-registry";
import { detectUrlsInText, type DetectedUrl } from "@/lib/creator/url-detection";
import {
  patchSectionLabel,
  readRevisionSectionText,
  resolvePatchScope,
} from "@/lib/creator/patch-protocol";
import {
  executeBuiltinSkill,
  getSkillManifest,
  matchSkillByInstruction,
} from "@/lib/creator/skill-registry";
import { buildPublishReadinessReply } from "@/lib/creator/publish-handoff";
import { assertUrlSafe } from "@/lib/security/url-guard";
import { enqueueJob } from "@/lib/jobs/queues";

/**
 * C3 Agent 服务:消息、卡片动作与 AgentRun 的唯一服务端入口。
 *
 * 事务与幂等:
 * - 发送消息:user + pending assistant + AgentRun 在一个事务内创建;
 *   conversationId + clientMessageId 唯一,重放返回首次记录。
 * - 卡片动作:先纯执行处理器,再在一个事务内落结果消息 + AgentRun;
 *   非重复动作幂等键 action:{cardId}:{actionId},可重复动作 action:{clientActionId},
 *   均由 Message 唯一约束兜底,重复请求返回第一次执行结果。
 * - 回复失败:assistant 消息置 failed、AgentRun 置 failed,刷新后可从库恢复。
 */

const ASSISTANT_KEY_PREFIX = "assistant:";
const ACTION_KEY_PREFIX = "action:";

export type AgentReply = { text: string; cards: ChatCard[] };

export type ReplyBuilder = (input: {
  userId: string;
  conversationId: string;
  text: string;
}) => Promise<AgentReply> | AgentReply;

const DIRECTION_CARD_ID = "card-direction";

async function conversationHasDirectionCard(conversationId: string): Promise<boolean> {
  const candidates = await prisma.message.findMany({
    where: { conversationId, role: "assistant", metadata: { not: Prisma.AnyNull } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { metadata: true },
  });
  return candidates.some((message) =>
    parseChatMessageMetadata(message.metadata)?.cards.some(
      (card) => card.id === DIRECTION_CARD_ID,
    ),
  );
}

/** 参考卡上的标准动作集(content/webpage 导入)。 */
export function referenceCardActions(): CardAction[] {
  return [
    { actionId: "reference.generate_original", label: "参考结构生成原创稿", appearance: "primary" },
    { actionId: "reference.extract_idea", label: "提炼为选题" },
    { actionId: "reference.add_to_collection", label: "加入参考集" },
    { actionId: "reference.add_to_style_profile", label: "构建风格画像" },
    { actionId: "reference.view_evidence", label: "查看证据", appearance: "ghost" },
    { actionId: "reference.retry", label: "重新导入", appearance: "ghost", repeatable: true },
  ];
}

export function importIdempotencyKey(userId: string, url: string): string {
  return createHash("sha256").update(`${userId}:${url}`).digest("hex");
}

/** URL 消息:逐个校验并创建导入任务,返回 ReferenceCard;非法链接给出可恢复错误。 */
async function buildImportReply(params: {
  userId: string;
  runId: string;
  conversationId: string;
  text: string;
}): Promise<AgentReply> {
  const { detected, invalid } = detectUrlsInText(params.text);
  const cards: ChatCard[] = [];
  const imported: DetectedUrl[] = [];
  const rejected = [...invalid];

  for (const item of detected) {
    try {
      await assertUrlSafe(item.normalized);
    } catch (error) {
      rejected.push({
        url: item.raw,
        reason: error instanceof Error ? error.message : "链接被安全策略拒绝。",
      });
      continue;
    }
    const job = await enqueueJob({
      userId: params.userId,
      type: JobType.ingest,
      action: "reference.import",
      input: {
        url: item.normalized,
        kind: item.kind,
        conversationId: params.conversationId,
      },
      idempotencyKey: importIdempotencyKey(params.userId, item.normalized),
      agentRunId: params.runId,
    });
    imported.push(item);
    cards.push({
      id: `card-ref-${job.id}`,
      version: 1,
      type: "reference",
      state: "importing",
      sourceUrl: item.normalized,
      platform: item.platform,
      jobId: job.id,
      actions: item.kind === "account" ? undefined : referenceCardActions(),
    });
  }

  if (rejected.length) {
    cards.push({
      id: `notice-invalid-url-${params.runId.slice(-8)}`,
      version: 1,
      type: "notice",
      tone: "error",
      title: "部分链接无法导入",
      body: rejected
        .map((item) => `${item.url.slice(0, 80)}:${item.reason}`)
        .join("\n"),
    });
  }

  const text = imported.length
    ? `已开始导入 ${imported.length} 个链接。导入完成后可以直接选择「参考结构生成原创稿」,也可以提炼为选题或查看证据。`
    : "这些链接都无法导入,请检查后重新粘贴。";
  return { text, cards };
}

/** C3/C4 默认回复:确定性中文文案;URL 消息在 handleUserMessage 中走导入分支。 */
export const buildDefaultReply: ReplyBuilder = async ({ conversationId, text }) => {
  if (!(await conversationHasDirectionCard(conversationId))) {
    return {
      text: "收到。为了让后面的创作更聚焦,先确认一下这条内容的方向:",
      cards: [
        {
          id: DIRECTION_CARD_ID,
          version: 1,
          type: "option",
          title: "选择内容方向",
          mode: "single",
          options: [
            { id: "direction-experience", label: "经验分享", description: "以个人经历和感受带出方法", recommended: true },
            { id: "direction-checklist", label: "步骤清单", description: "按步骤给出可执行做法" },
            { id: "direction-contrarian", label: "反常识观点", description: "用一个出人意料的判断切入" },
          ],
          submitAction: { actionId: "direction.choose", label: "确认方向", appearance: "primary" },
        },
      ],
    };
  }

  return {
    text: `已记录:「${text.slice(0, 80)}${text.length > 80 ? "…" : ""}」。当前版本可以在对话里确定方向并持续保存会话;初稿生成、链接导入和评分会按计划逐步接入,到时会直接出现在这条消息流里。`,
    cards: [],
  };
};

/**
 * C7 选中区块修改提案:客户端只提交区块引用与摘录,
 * 服务端从当前用户的内容项目解析最新版本、读取真实区块文本,
 * 经内置 Skill Registry 生成 content.propose_patch 卡(本地协议预览)。
 * 不信任客户端提交的正文;应用时 patch.apply 还会再做版本与文本一致性校验。
 */
async function buildPatchReply(params: {
  userId: string;
  runId: string;
  text: string;
  patchTarget: PatchTarget;
}): Promise<AgentReply> {
  const { patchTarget } = params;
  const content = await prisma.generatedContent.findFirst({
    where: { id: patchTarget.contentId, userId: params.userId },
    include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } },
  });
  if (!content) throw new AppError("NOT_FOUND", "内容项目不存在,或不属于当前账号。", 404);
  const latest = content.revisions[0];
  if (!latest) {
    return { text: "这个内容项目还没有任何版本,先生成或保存一版内容后再发起修改。", cards: [] };
  }
  const contentKind = content.contentKind as "xhs_graphic" | "douyin_video_script";
  const sectionLabel = patchSectionLabel(contentKind, patchTarget.section);
  const sectionText = readRevisionSectionText(
    {
      title: latest.title,
      bodyText: latest.bodyText,
      structuredContent: latest.structuredContent,
    },
    patchTarget.section,
  );
  if (sectionText === null || sectionText.trim() === "") {
    return {
      text: `当前版本 v${latest.revisionNumber} 中没有找到「${sectionLabel}」的可修改文本;请先在编辑器里补充该区块内容。`,
      cards: [],
    };
  }

  const skillId =
    patchTarget.skillId && getSkillManifest(patchTarget.skillId)
      ? patchTarget.skillId
      : matchSkillByInstruction(params.text);
  await resolveSelectedSkills(params.userId, [skillId], "patch");
  const before = resolvePatchScope(sectionText, patchTarget.excerpt);
  const result = executeBuiltinSkill(skillId, {
    instruction: params.text,
    sectionLabel,
    before,
    contentKind,
  });

  const proposal = (result.proposedEffects ?? []).find(
    (effect) => effect.type === "content.propose_revision",
  );
  const after =
    proposal && typeof (proposal.payload as { after?: unknown })?.after === "string"
      ? ((proposal.payload as { after: string }).after ?? "").slice(0, 4000)
      : null;

  // 无修改提案的 Skill(如风险检查)只返回说明文本
  if (after === null) {
    return {
      text:
        result.text ??
        "该技能没有产生修改提案;可以换一个技能,或补充更具体的指令。",
      cards: [],
    };
  }
  if (after.trim() === "" || after === before) {
    return {
      text: `本地规则没能为「${sectionLabel}」生成有效的修改提案;可以在指令里用「」写出想要的表述,或等真实 AI 改写接入后再试。`,
      cards: [],
    };
  }

  return {
    text: `已为「${sectionLabel}」生成修改提案(本地规则协议预览,非 AI 改写)。确认后会基于 v${latest.revisionNumber} 创建新版本,不会覆盖历史。`,
    cards: [
      {
        id: `card-patch-${params.runId.slice(-12)}`,
        version: 1,
        type: "patch",
        contentId: content.id,
        revisionId: latest.id,
        revisionNumber: latest.revisionNumber,
        contentKind,
        section: patchTarget.section,
        sectionLabel,
        skillId,
        instruction: params.text.slice(0, 2000),
        before,
        after,
        note: "本地确定性规则生成的协议预览;接入真实 AI 改写前,用于验证提案-应用链路。",
        origin: "local_preview",
        actions: [
          { actionId: "patch.apply", label: "应用为新版本", appearance: "primary" },
          { actionId: "patch.dismiss", label: "忽略", appearance: "ghost" },
        ],
      },
    ],
  };
}

/**
 * C8 纯文本发布意图(chat-first):短消息里明确提出发布准备时,
 * 对当前会话最近更新的内容项目发起就绪检查;没有内容时给出指引。
 * 刻意收紧匹配(排除「发布会」),避免劫持普通创作消息。
 */
const PUBLISH_INTENT_PATTERN = /(准备|确认|开始|发起|移交)发布(?!会)|发布(准备|检查|就绪)/;

export function isPublishIntent(text: string): boolean {
  return text.length <= 60 && PUBLISH_INTENT_PATTERN.test(text);
}

/** 纯文本发布意图:解析会话内最近的内容项目再走就绪检查。 */
async function buildPublishIntentReply(params: {
  userId: string;
  conversationId: string;
  runId: string;
}): Promise<AgentReply> {
  const content = await prisma.generatedContent.findFirst({
    where: { userId: params.userId, conversationId: params.conversationId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!content) {
    return {
      text: "这个会话还没有可发布的正式内容。先生成或保存一版内容,再从成果卡或右侧编辑器的「准备发布」发起;也可以直接描述你想创作的内容。",
      cards: [],
    };
  }
  return buildPublishReadinessReply({
    userId: params.userId,
    contentId: content.id,
    cardIdSuffix: params.runId.slice(-12),
  });
}

export async function requireConversation(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
  if (!conversation) throw new AppError("NOT_FOUND", "会话不存在,或不属于当前账号。", 404);
  return conversation;
}

function buildMetadata(cards: ChatCard[], runId: string) {
  if (!cards.length) return undefined;
  // 写库前强制走协议校验,杜绝凭证原文、供应商原始响应等未声明字段。
  return chatMessageMetadataV1Schema.parse({
    protocol: CHAT_PROTOCOL,
    cards,
    runId,
  }) as unknown as Prisma.InputJsonValue;
}

async function loadMessageBundle(conversationId: string, clientMessageId: string) {
  const [userMessage, assistantMessage] = await Promise.all([
    prisma.message.findUnique({
      where: { conversationId_clientMessageId: { conversationId, clientMessageId } },
    }),
    prisma.message.findUnique({
      where: {
        conversationId_clientMessageId: {
          conversationId,
          clientMessageId: `${ASSISTANT_KEY_PREFIX}${clientMessageId}`,
        },
      },
    }),
  ]);
  if (!userMessage) return null;
  const run = await prisma.agentRun.findFirst({
    where: { requestMessageId: userMessage.id },
  });
  return { userMessage, assistantMessage, run };
}

export async function handleUserMessage(params: {
  userId: string;
  conversationId: string;
  text: string;
  clientMessageId: string;
  skillIds?: string[];
  patchTarget?: PatchTarget;
  publishTarget?: PublishTarget;
  replyBuilder?: ReplyBuilder;
}) {
  const conversation = await requireConversation(params.userId, params.conversationId);

  // 幂等重放:同一 clientMessageId 返回首次记录,不再次执行
  const replayed = await loadMessageBundle(params.conversationId, params.clientMessageId);
  if (replayed) return { ...replayed, replayed: true };

  const selectedSkillIds = params.skillIds ?? conversation.activeSkillIds;
  const selectedSkills = await resolveSelectedSkills(
    params.userId,
    selectedSkillIds,
    "generation",
  );

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const userMessage = await tx.message.create({
        data: {
          conversationId: params.conversationId,
          role: "user",
          content: params.text,
          status: "complete",
          clientMessageId: params.clientMessageId,
        },
      });
      const assistantMessage = await tx.message.create({
        data: {
          conversationId: params.conversationId,
          role: "assistant",
          content: "",
          status: "pending",
          clientMessageId: `${ASSISTANT_KEY_PREFIX}${params.clientMessageId}`,
        },
      });
      const run = await tx.agentRun.create({
        data: {
          userId: params.userId,
          conversationId: params.conversationId,
          requestMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
          status: "running",
          command: "chat.reply",
          input: {
            text: params.text.slice(0, 500),
            skillIds: selectedSkills.map((skill) => skill.id),
            skills: selectedSkills,
          } as Prisma.InputJsonValue,
          startedAt: new Date(),
        },
      });
      await tx.conversation.update({
        where: { id: params.conversationId },
        data: {
          updatedAt: new Date(),
          activeSkillIds: selectedSkills.map((skill) => skill.id),
        },
      });
      return { userMessage, assistantMessage, run };
    });
  } catch (error) {
    // 并发重复请求:回退到重放读取
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await loadMessageBundle(params.conversationId, params.clientMessageId);
      if (raced) return { ...raced, replayed: true };
    }
    throw error;
  }

  const builder = params.replyBuilder ?? buildDefaultReply;
  try {
    const urlScan = detectUrlsInText(params.text);
    const reply =
      !params.replyBuilder && params.patchTarget
        ? await buildPatchReply({
            userId: params.userId,
            runId: created.run.id,
            text: params.text,
            patchTarget: params.patchTarget,
          })
        : !params.replyBuilder && params.publishTarget
        ? await buildPublishReadinessReply({
            userId: params.userId,
            contentId: params.publishTarget.contentId,
            cardIdSuffix: created.run.id.slice(-12),
          })
        : !params.replyBuilder && (urlScan.detected.length || urlScan.invalid.length)
        ? await buildImportReply({
            userId: params.userId,
            runId: created.run.id,
            conversationId: params.conversationId,
            text: params.text,
          })
        : !params.replyBuilder && isPublishIntent(params.text)
        ? await buildPublishIntentReply({
            userId: params.userId,
            conversationId: params.conversationId,
            runId: created.run.id,
          })
        : await builder({
            userId: params.userId,
            conversationId: params.conversationId,
            text: params.text,
          });
    const metadata = buildMetadata(reply.cards, created.run.id);
    // 就绪检查等分支会声明真实命令(如 publish.prepare),落到 AgentRun 便于追溯
    const replyCommand = (reply as { command?: string }).command;
    const [assistantMessage, run] = await prisma.$transaction([
      prisma.message.update({
        where: { id: created.assistantMessage.id },
        data: { content: reply.text, status: "complete", metadata },
      }),
      prisma.agentRun.update({
        where: { id: created.run.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          output: { cardCount: reply.cards.length },
          ...(replyCommand ? { command: replyCommand } : {}),
        },
      }),
    ]);
    return { userMessage: created.userMessage, assistantMessage, run, replayed: false };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "未知错误";
    const [assistantMessage, run] = await prisma.$transaction([
      prisma.message.update({
        where: { id: created.assistantMessage.id },
        data: { content: `这条消息处理失败:${reason}`, status: "failed" },
      }),
      prisma.agentRun.update({
        where: { id: created.run.id },
        data: { status: "failed", completedAt: new Date(), errorMessage: reason },
      }),
    ]);
    return { userMessage: created.userMessage, assistantMessage, run, replayed: false };
  }
}

export async function listConversationMessages(params: {
  userId: string;
  conversationId: string;
  cursor?: string;
  limit?: number;
}) {
  const conversation = await requireConversation(params.userId, params.conversationId);
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 200);
  const messages = await prisma.message.findMany({
    where: { conversationId: params.conversationId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    take: limit,
  });
  // 已处理动作键:客户端据此把已消费的卡片置为 disabled
  const processedActionKeys = messages
    .map((message) => message.clientMessageId)
    .filter((key): key is string => Boolean(key?.startsWith(ACTION_KEY_PREFIX)));
  const activeRun = await prisma.agentRun.findFirst({
    where: {
      conversationId: params.conversationId,
      userId: params.userId,
      status: { in: ["pending", "running", "waiting_input"] },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, command: true },
  });
  return {
    messages,
    processedActionKeys,
    activeRun,
    activeSkillIds: conversation.activeSkillIds,
    nextCursor: messages.length === limit ? messages[messages.length - 1].id : null,
  };
}

function findCardAction(card: ChatCard, actionId: string): CardAction | null {
  const candidates: CardAction[] = [];
  if (card.type === "option") candidates.push(card.submitAction);
  if (card.type === "approval") candidates.push(card.confirmAction, card.cancelAction);
  if ("actions" in card && card.actions) candidates.push(...card.actions);
  return candidates.find((action) => action.actionId === actionId) ?? null;
}

export function actionIdempotencyKey(params: {
  repeatable: boolean;
  clientActionId: string;
  cardId: string;
  actionId: string;
}) {
  return params.repeatable
    ? `${ACTION_KEY_PREFIX}${params.clientActionId}`
    : `${ACTION_KEY_PREFIX}${params.cardId}:${params.actionId}`;
}

export async function invokeCardAction(params: {
  userId: string;
  conversationId: string;
  clientActionId: string;
  sourceMessageId: string;
  cardId: string;
  actionId: string;
  values?: { optionIds?: string[]; text?: string };
}) {
  await requireConversation(params.userId, params.conversationId);

  // 从当前用户会话内的原消息解析真实卡片与动作;客户端提交的其余参数一律不信任
  const source = await prisma.message.findFirst({
    where: { id: params.sourceMessageId, conversationId: params.conversationId },
  });
  if (!source) throw new AppError("NOT_FOUND", "原消息不存在,或不属于当前会话。", 404);

  const metadata = parseChatMessageMetadata(source.metadata);
  const card = metadata?.cards.find((item) => item.id === params.cardId);
  if (!card) throw new AppError("VALIDATION_ERROR", "卡片不存在或已失效。", 400);

  const action = findCardAction(card, params.actionId);
  if (!action) throw new AppError("VALIDATION_ERROR", "该卡片上没有这个动作。", 400);

  const handler = getActionHandler(params.actionId);
  if (!handler) throw new AppError("FORBIDDEN", "动作不在白名单内,已拒绝执行。", 403);

  const repeatable = handler.repeatable && action.repeatable !== false;
  const idempotencyKey = actionIdempotencyKey({
    repeatable,
    clientActionId: params.clientActionId,
    cardId: params.cardId,
    actionId: params.actionId,
  });

  const existing = await prisma.message.findUnique({
    where: {
      conversationId_clientMessageId: {
        conversationId: params.conversationId,
        clientMessageId: idempotencyKey,
      },
    },
  });
  if (existing) return { resultMessage: existing, replayed: true };

  // 处理器是纯函数:先执行,成功后才在一个事务里落结果,失败无部分写入
  const result: ActionResult = await handler.execute({
    userId: params.userId,
    conversationId: params.conversationId,
    sourceMessageId: params.sourceMessageId,
    card,
    action,
    values: params.values ?? {},
  });

  try {
    const { resultMessage, run } = await prisma.$transaction(async (tx) => {
      const run = await tx.agentRun.create({
        data: {
          userId: params.userId,
          conversationId: params.conversationId,
          requestMessageId: params.sourceMessageId,
          status: "completed",
          command: result.command ?? `action:${params.actionId}`,
          input: {
            clientActionId: params.clientActionId,
            sourceMessageId: params.sourceMessageId,
            cardId: params.cardId,
            actionId: params.actionId,
            values: params.values ?? {},
          },
          startedAt: new Date(),
          completedAt: new Date(),
        },
      });
      const resultMessage = await tx.message.create({
        data: {
          conversationId: params.conversationId,
          role: "assistant",
          content: result.text,
          status: "complete",
          clientMessageId: idempotencyKey,
          metadata: buildMetadata(result.cards ?? [], run.id),
        },
      });
      await tx.agentRun.update({
        where: { id: run.id },
        data: { assistantMessageId: resultMessage.id },
      });
      await tx.conversation.update({
        where: { id: params.conversationId },
        data: { updatedAt: new Date() },
      });
      return { resultMessage, run };
    });
    return { resultMessage, run, replayed: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.message.findUnique({
        where: {
          conversationId_clientMessageId: {
            conversationId: params.conversationId,
            clientMessageId: idempotencyKey,
          },
        },
      });
      if (raced) return { resultMessage: raced, replayed: true };
    }
    throw error;
  }
}

export async function getAgentRunForUser(userId: string, runId: string) {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, userId } });
  if (!run) throw new AppError("NOT_FOUND", "任务不存在,或不属于当前账号。", 404);
  return run;
}

export async function cancelAgentRun(userId: string, runId: string) {
  const run = await getAgentRunForUser(userId, runId);
  if (["completed", "failed", "canceled"].includes(run.status)) {
    return run; // 幂等:终态直接返回
  }
  const [updated] = await prisma.$transaction([
    prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "canceled", completedAt: new Date() },
    }),
    ...(run.assistantMessageId
      ? [
          prisma.message.updateMany({
            where: { id: run.assistantMessageId, status: "pending" },
            data: { status: "failed", content: "这次处理已被你取消。" },
          }),
        ]
      : []),
  ]);
  return updated;
}
