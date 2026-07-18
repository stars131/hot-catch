import { JobType, Prisma } from "@prisma/client";
import type {
  CardAction,
  ChatCard,
  DirectionRecommendationCard,
} from "@/lib/creator/chat-protocol";
import { prisma } from "@/lib/prisma";
import { AppError, isAppError } from "@/lib/errors";
import { enqueueJob } from "@/lib/jobs/queues";
import {
  buildBriefFromIdea,
  buildBriefFromNote,
  urlFingerprint,
  type ReferenceBrief,
} from "@/lib/creator/reference-brief";
import { applyRevisionSectionPatch } from "@/lib/creator/patch-protocol";
import { buildManualRevisionPayload } from "@/lib/content/markdown";
import { createContentRevision } from "@/lib/services/content-project-service";
import {
  resolveConversationSkills,
  skillSnapshotsJson,
} from "@/lib/services/skill-service";
import {
  buildPublishReadinessReply,
  confirmPublishHandoff,
} from "@/lib/creator/publish-handoff";
import { missingItemsPrompt } from "@/lib/creator/publish-readiness";
import { assertUrlSafe } from "@/lib/security/url-guard";
import { createHash } from "node:crypto";
import {
  GLOBAL_PLATFORM_IDS,
  PLATFORM_DEFINITIONS,
  isContentLocale,
  isPlatformId,
  type PlatformId,
} from "@/lib/platforms/registry";
import { isForeignPlatformCreationEnabled } from "@/lib/env";
import { buildCreationSetupCard } from "@/lib/creator/creation-setup";
import { createGenerationBatch } from "@/lib/services/generation-batch-service";
import {
  buildSelectedIdeaBrief,
  generateIdeaCandidatesCard,
} from "@/lib/creator/idea-assistant";
import {
  builtinDirection,
  directionRefSchema,
  type DirectionSelection,
  type DirectionSnapshot,
  normalizeCreativeDirection,
} from "@/lib/creator/creative-direction";
import {
  confirmCreativeDirectionDecision,
  recommendCreativeDirections,
  type DirectionAnalysis,
} from "@/lib/services/creative-direction-service";
import { createLlmProvider } from "@/lib/providers/factory";
import { getPlatformServerDefinition } from "@/lib/platforms/server-registry";
import { scoreContentProject } from "@/lib/services/scoring-service";
import {
  directionFromContentSnapshot,
  directionReviewCard,
  reviewContentDirection,
} from "@/lib/services/content-direction-review-service";
import { resolvePendingInteractionByAction } from "@/lib/services/interaction-service";

/**
 * C3 服务端动作注册表。
 *
 * 客户端只回传 messageId + cardId + actionId + values;
 * 服务端从当前用户拥有的原消息 metadata 中解析卡片与动作,
 * 只有出现在本注册表中的 actionId 才会执行。
 * 处理器返回回复文本与卡片,由 agent-service 负责持久化。
 */

export type ActionContext = {
  userId: string;
  conversationId: string;
  sourceMessageId: string;
  card: ChatCard;
  action: CardAction;
  values: { optionIds?: string[]; text?: string };
};

export type ActionResult = {
  text: string;
  cards?: ChatCard[];
  command?: string;
};

type ActionHandler = {
  /** true 时同一卡片可重复执行(每次 clientActionId 各自幂等) */
  repeatable: boolean;
  execute: (context: ActionContext) => Promise<ActionResult> | ActionResult;
};

function requireOptionLabels(context: ActionContext): string[] {
  if (context.card.type !== "option") {
    throw new Error("该动作只能由选项卡触发。");
  }
  const chosen = context.values.optionIds ?? [];
  const labels = context.card.options
    .filter((option) => chosen.includes(option.id))
    .map((option) => option.label);
  if (labels.length === 0) {
    throw new Error("请先选择一个选项。");
  }
  return labels;
}

function directionRecommendationCard(params: {
  decisionId: string;
  brief: string;
  uiLocale: "zh-CN" | "en-US";
  analysis: DirectionAnalysis;
}): DirectionRecommendationCard {
  const zh = params.uiLocale === "zh-CN";
  return {
    id: `card-direction-${params.decisionId.slice(-12)}`,
    version: 1,
    type: "direction_recommendation",
    decisionId: params.decisionId,
    brief: params.brief,
    uiLocale: params.uiLocale,
    source: params.analysis.source,
    intentSummary: params.analysis.intentSummary,
    state: params.analysis.needsInput ? "needs_input" : "ready",
    missingInputs: params.analysis.missingInputs,
    recommendations: params.analysis.recommendations,
    confirmAction: {
      actionId: "direction.confirm",
      label: zh ? "确认方向" : "Confirm direction",
      appearance: "primary",
    },
    supplementAction: {
      actionId: "direction.supplement",
      label: zh ? "补充并重新分析" : "Add details and reanalyze",
      appearance: "primary",
    },
  };
}

function parseDirectionActionText(value: string | undefined) {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new AppError("VALIDATION_ERROR", "方向选择数据格式不正确。", 422);
  }
}

/** 参考动作共用:从卡片解析导入任务并加载脱敏 Brief;严禁读取客户端提交的实体 ID。 */
async function loadReferenceContext(context: ActionContext): Promise<{
  jobId: string;
  sourceUrl: string;
  brief: ReferenceBrief;
  platform: PlatformId;
  benchmarkNoteId?: string;
  ideaId?: string;
}> {
  if (context.card.type !== "reference" || !context.card.jobId) {
    throw new AppError("VALIDATION_ERROR", "该动作只能由参考卡触发。", 400);
  }
  const job = await prisma.processingJob.findFirst({
    where: { id: context.card.jobId, userId: context.userId },
  });
  if (!job) throw new AppError("NOT_FOUND", "导入任务不存在或不属于当前账号。", 404);
  if (job.status !== "succeeded") {
    throw new AppError("VALIDATION_ERROR", "导入尚未完成,完成后才能执行该动作。", 400);
  }

  if (job.resultType === "benchmarkNote" && job.resultId) {
    const note = await prisma.benchmarkNote.findFirst({
      where: { id: job.resultId, account: { userId: context.userId } },
      include: { account: { select: { nickname: true, platform: true } } },
    });
    if (!note) throw new AppError("NOT_FOUND", "参考作品不存在或不属于当前账号。", 404);
    const platform = note.account?.platform === "douyin" ? "douyin" : "xiaohongshu";
    return {
      jobId: job.id,
      sourceUrl: note.noteUrl ?? context.card.sourceUrl,
      brief: buildBriefFromNote(note, platform),
      platform,
      benchmarkNoteId: note.id,
    };
  }
  if (job.resultType === "idea" && job.resultId) {
    const idea = await prisma.idea.findFirst({
      where: { id: job.resultId, userId: context.userId },
    });
    if (!idea) throw new AppError("NOT_FOUND", "参考资料不存在或不属于当前账号。", 404);
    const cardPlatform = context.card.platform;
    const platform = isPlatformId(cardPlatform) ? cardPlatform : "xiaohongshu";
    return {
      jobId: job.id,
      sourceUrl: context.card.sourceUrl,
      brief: buildBriefFromIdea(idea, "basic_fetch"),
      platform,
      ideaId: idea.id,
    };
  }
  throw new AppError("VALIDATION_ERROR", "该导入结果不支持此动作。", 400);
}

export const ACTION_REGISTRY: Record<string, ActionHandler> = {
  "direction.supplement": {
    repeatable: false,
    execute: async (context) => {
      if (context.card.type !== "direction_recommendation") {
        throw new AppError("VALIDATION_ERROR", "该动作只能由方向推荐卡触发。", 400);
      }
      const payload = parseDirectionActionText(context.values.text);
      const answersValue = payload.answers;
      const answers = answersValue && typeof answersValue === "object" && !Array.isArray(answersValue)
        ? Object.fromEntries(Object.entries(answersValue).flatMap(([key, value]) =>
            typeof value === "string" && value.trim() ? [[key, value.trim()]] : [],
          ))
        : {};
      for (const item of context.card.missingInputs.filter((item) => item.required)) {
        if (!answers[item.key]) {
          throw new AppError("VALIDATION_ERROR", `请补充“${item.label}”。`, 422);
        }
      }
      const result = await recommendCreativeDirections({
        userId: context.userId,
        conversationId: context.conversationId,
        sourceMessageId: context.sourceMessageId,
        brief: context.card.brief,
        uiLocale: context.card.uiLocale,
        supplementalAnswers: answers,
      });
      await resolvePendingInteractionByAction({
        userId: context.userId,
        conversationId: context.conversationId,
        actionKey: `${context.card.id}:${context.action.actionId}`,
        resolution: { answers } as Prisma.InputJsonValue,
      });
      return {
        text: context.card.uiLocale === "zh-CN"
          ? "已结合补充信息重新判断方向，请确认主方向和可选辅方向。"
          : "I reanalyzed the brief with your additional details. Confirm a primary and optional secondary direction.",
        cards: [directionRecommendationCard({
          decisionId: result.decisionId,
          brief: context.card.brief,
          uiLocale: context.card.uiLocale,
          analysis: result.analysis,
        })],
        command: "direction.analyze",
      };
    },
  },

  "direction.confirm": {
    repeatable: false,
    execute: async (context) => {
      if (context.card.type !== "direction_recommendation") {
        throw new AppError("VALIDATION_ERROR", "该动作只能由方向推荐卡触发。", 400);
      }
      if (context.card.state === "needs_input") {
        throw new AppError("VALIDATION_ERROR", "请先补充卡片中要求的信息。", 422);
      }
      const payload = parseDirectionActionText(context.values.text);
      const defaultPrimary = context.card.recommendations[0]?.ref;
      const primary = directionRefSchema.parse(payload.primary ?? defaultPrimary);
      const secondary = payload.secondary
        ? directionRefSchema.parse(payload.secondary)
        : undefined;
      const { selection, snapshot } = await confirmCreativeDirectionDecision({
        userId: context.userId,
        conversationId: context.conversationId,
        decisionId: context.card.decisionId,
        primary,
        secondary,
      });
      const zh = context.card.uiLocale === "zh-CN";
      const primaryLabel = zh ? snapshot.primary.labels.zhCN : snapshot.primary.labels.enUS;
      const secondaryLabel = snapshot.secondary
        ? (zh ? snapshot.secondary.labels.zhCN : snapshot.secondary.labels.enUS)
        : undefined;
      const directionLabel = [primaryLabel, secondaryLabel].filter(Boolean).join(zh ? " + " : " + ");
      try {
        const ideaCard = await generateIdeaCandidatesCard({
          userId: context.userId,
          brief: context.card.brief,
          direction: directionLabel,
          directionSelection: selection,
          directionSnapshot: snapshot,
          uiLocale: context.card.uiLocale,
          nonce: `${context.sourceMessageId}:${context.card.decisionId}`,
        });
        return {
          text: zh
            ? `已确认主方向「${primaryLabel}」${secondaryLabel ? `，辅方向「${secondaryLabel}」` : ""}。我正在按这组规则整理选题。`
            : `Primary direction confirmed as “${primaryLabel}”${secondaryLabel ? ` with “${secondaryLabel}” as the secondary direction` : ""}. I prepared ideas using this combination.`,
          cards: [ideaCard],
          command: "idea.propose",
        };
      } catch (error) {
        if (
          !isAppError(error) ||
          !["CREDENTIAL_NOT_CONFIGURED", "CREDENTIAL_INVALID", "AI_GENERATION_FAILED", "PROVIDER_ERROR"].includes(error.code)
        ) throw error;
      }
      return {
        text: zh
          ? `方向已确认，但当前模型暂时无法生成候选选题。你仍可继续配置创作任务。`
          : "The direction is confirmed, but the configured model could not generate idea candidates. You can continue with the creation setup.",
        cards: [
          {
            id: `notice-idea-model-${context.sourceMessageId.slice(-10)}`,
            version: 1,
            type: "notice",
            tone: "warning",
            title: zh ? "未生成 AI 候选选题" : "AI idea candidates unavailable",
            body: zh
              ? "请检查默认模型连接。系统没有使用模板伪造候选。"
              : "Check the default model connection. No placeholder ideas were substituted.",
          },
          await buildCreationSetupCard({
            userId: context.userId,
            conversationId: context.conversationId,
            brief: context.card.brief,
            directionSelection: selection,
            directionSnapshot: snapshot,
            uiLocale: context.card.uiLocale,
            nonce: `${context.sourceMessageId}:${context.card.decisionId}`,
          }),
        ],
        command: "content.create",
      };
    },
  },

  "direction.repair": {
    repeatable: false,
    execute: async (context) => {
      if (context.card.type !== "direction_review") {
        throw new AppError("VALIDATION_ERROR", "该动作只能由方向审查卡触发。", 400);
      }
      if (context.card.status !== "needs_attention" || !context.card.suggestions.length) {
        throw new AppError("VALIDATION_ERROR", "当前审查没有需要自动修订的建议。", 422);
      }
      const content = await prisma.generatedContent.findFirst({
        where: { id: context.card.contentId, userId: context.userId },
        include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } },
      });
      const latest = content?.revisions[0];
      if (!content || !latest) throw new AppError("NOT_FOUND", "内容版本不存在。", 404);
      if (latest.id !== context.card.revisionId) {
        throw new AppError("CONFLICT", "内容已产生新版本，请对最新版本重新审查后再修订。", 409);
      }
      if (!isContentLocale(content.contentLocale)) {
        throw new AppError("VALIDATION_ERROR", "内容语言不受支持。", 422);
      }
      const direction = directionFromContentSnapshot(content.contextSnapshot);
      if (!direction) throw new AppError("VALIDATION_ERROR", "该内容没有可用的方向快照。", 422);
      const definition = getPlatformServerDefinition(content.contentKind);
      const provider = await createLlmProvider(context.userId);
      const generated = await provider.generateStructured({
        system: [
          "你是内容修订编辑。根据给定方向 Manifest 和审查建议修订内容，保留没有问题的信息与结构。",
          "不得新增未经用户提供的经历、事实、数据、热点或承诺。只返回符合目标平台 Schema 的 JSON。",
          `主方向：${direction.primary.labels.zhCN}\n${direction.primary.generation.primaryInstruction}`,
          direction.secondary
            ? `辅方向：${direction.secondary.labels.zhCN}\n${direction.secondary.generation.secondaryInstruction}`
            : "",
          `证据边界：${direction.primary.evidence.policy}`,
        ].filter(Boolean).join("\n\n"),
        prompt: JSON.stringify({
          current: {
            title: latest.title,
            bodyText: latest.bodyText,
            structuredContent: latest.structuredContent,
          },
          reviewSummary: context.card.summary,
          suggestions: context.card.suggestions,
          targetLocale: content.contentLocale,
          platform: content.platform,
        }),
        schema: definition.schema,
        temperature: 0.2,
      });
      const parsed = definition.schema.parse(generated);
      const normalized = definition.normalize(parsed);
      const revision = await createContentRevision(
        context.userId,
        content.id,
        {
          source: "generated",
          title: normalized.title,
          bodyText: normalized.bodyText,
          structuredContent: parsed,
          fullMarkdown: normalized.fullMarkdown,
        },
        {
          provenance: {
            promptVersion: "direction-repair/v1",
            provider: provider.name,
            model: provider.model,
            basedOnRevisionId: latest.id,
            suggestions: context.card.suggestions,
          } as unknown as Prisma.InputJsonValue,
        },
      );
      const parsedRecord = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
      await prisma.generatedContent.update({
        where: { id: content.id },
        data: {
          scriptSpec: parsed as unknown as Prisma.InputJsonValue,
          tags: normalized.tags,
          riskNotes: normalized.riskNotes.join("\n"),
          modelName: `${provider.name}/${provider.model}`,
          promptVersion: "direction-repair/v1",
          ...(content.contentKind === "xhs_graphic" ? {
            generatedTitleOptions: toNullableJson(parsedRecord.titleOptions),
            coverTextOptions: toNullableJson(parsedRecord.coverTextOptions),
            pageStructure: toNullableJson(parsedRecord.pages),
            interactionEnding: typeof parsedRecord.interactionEnding === "string"
              ? parsedRecord.interactionEnding
              : null,
          } : {}),
        },
      });
      const scoring = content.contentKind === "xhs_graphic" || content.contentKind === "douyin_video_script"
        ? await scoreContentProject(context.userId, content.id)
        : null;
      const review = await reviewContentDirection({
        userId: context.userId,
        contentId: content.id,
        revisionId: revision.id,
        stage: "generation",
      });
      const cards: ChatCard[] = [{
        id: `card-artifact-repair-${revision.id.slice(-12)}`,
        version: 1,
        type: "artifact",
        contentId: content.id,
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        platform: definition.platform,
        contentKind: content.contentKind,
        contentLocale: content.contentLocale,
        title: normalized.title,
        preview: normalized.bodyText.slice(0, 200),
        ...(scoring ? { score: scoring.score.total } : {}),
        actions: [
          { actionId: "artifact.open", label: "打开编辑", appearance: "primary", repeatable: true },
          { actionId: "artifact.refine", label: "继续优化", repeatable: true },
          ...(definition.platform === "xiaohongshu" || definition.platform === "douyin"
            ? [{ actionId: "publish.prepare", label: "准备发布", repeatable: true }]
            : []),
        ],
      }];
      if (review) cards.push(directionReviewCard(review));
      return {
        text: `已根据方向审查建议创建 v${revision.revisionNumber}，原 v${latest.revisionNumber} 保留在版本历史中。`,
        cards,
        command: "content.generate",
      };
    },
  },

  /** 选项卡:确认内容方向 */
  "direction.choose": {
    repeatable: false,
    execute: async (context) => {
      const labels = requireOptionLabels(context);
      const creativeDirection = normalizeCreativeDirection(
        context.values.optionIds?.[0] ?? labels[0],
      );
      if (!creativeDirection) {
        throw new AppError("VALIDATION_ERROR", "无法识别所选表达方向。", 400);
      }
      const manifest = builtinDirection(creativeDirection);
      if (!manifest) throw new AppError("VALIDATION_ERROR", "方向定义不存在。", 422);
      const directionSelection: DirectionSelection = {
        primary: { key: manifest.key, version: manifest.version, source: "catalog" },
      };
      const directionSnapshot: DirectionSnapshot = {
        primary: manifest,
        capturedAt: new Date().toISOString(),
      };
      const sourceMessage = await prisma.message.findFirst({
        where: {
          id: context.sourceMessageId,
          conversationId: context.conversationId,
          conversation: { userId: context.userId },
        },
        select: { createdAt: true },
      });
      const latestBrief = await prisma.message.findFirst({
        where: {
          conversationId: context.conversationId,
          role: "user",
          ...(sourceMessage ? { createdAt: { lte: sourceMessage.createdAt } } : {}),
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, content: true },
      });
      const uiLocale =
        context.card.type === "option" && context.card.uiLocale === "en-US"
          ? "en-US"
          : "zh-CN";
      const brief = [
        latestBrief?.content || "请根据当前会话生成内容",
        uiLocale === "zh-CN"
          ? `表达方向：${labels.join("、")}`
          : `Direction: ${labels.join(", ")}`,
      ].join("\n");
      try {
        const ideaCard = await generateIdeaCandidatesCard({
          userId: context.userId,
          brief: latestBrief?.content || brief,
          direction: labels.join(uiLocale === "zh-CN" ? "、" : ", "),
          directionSelection,
          directionSnapshot,
          uiLocale,
          nonce: `${context.sourceMessageId}:${latestBrief?.id ?? "brief"}`,
        });
        return {
          text:
            uiLocale === "zh-CN"
              ? `方向已设为「${labels.join("、")}」。我根据这段需求整理了几个可继续推进的选题。`
              : `Direction set to “${labels.join(", ")}”. I drafted several ideas from your brief.`,
          cards: [ideaCard],
          command: "idea.propose",
        };
      } catch (error) {
        if (
          !isAppError(error) ||
          !["CREDENTIAL_NOT_CONFIGURED", "CREDENTIAL_INVALID", "AI_GENERATION_FAILED", "PROVIDER_ERROR"].includes(error.code)
        ) {
          throw error;
        }
      }
      return {
        text:
          uiLocale === "zh-CN"
            ? `方向已设为「${labels.join("、")}」。当前账号的模型暂时无法生成候选选题，我没有用模板伪造建议；你仍可直接选择目标平台、语言和 Skill。`
            : `Direction set to “${labels.join(", ")}”. Your model could not produce idea candidates, so no placeholder suggestions were substituted. You can still configure the target platforms, language and Skills.`,
        cards: [
          {
            id: `notice-idea-model-${context.sourceMessageId.slice(-10)}`,
            version: 1,
            type: "notice",
            tone: "warning",
            title: uiLocale === "zh-CN" ? "未生成 AI 候选选题" : "AI idea candidates unavailable",
            body:
              uiLocale === "zh-CN"
                ? "请在连接设置中确认个人默认模型可用。当前创作可以继续，但不会展示虚构的 AI 建议。"
                : "Check that your personal default model works in Connections. Creation can continue, but fabricated AI suggestions are never shown.",
            actions: [
              {
                actionId: "connection.open",
                label: uiLocale === "zh-CN" ? "打开连接设置" : "Open Connections",
                appearance: "ghost",
                repeatable: true,
              },
            ],
          },
          await buildCreationSetupCard({
            userId: context.userId,
            conversationId: context.conversationId,
            brief,
            directionSelection,
            directionSnapshot,
            uiLocale,
            nonce: `${context.sourceMessageId}:${latestBrief?.id ?? "brief"}`,
          }),
        ],
        command: "content.create",
      };
    },
  },

  "idea.choose": {
    repeatable: false,
    execute: async (context) => {
      if (context.card.type !== "idea_candidates") {
        throw new AppError("VALIDATION_ERROR", "选题候选卡类型不匹配。", 400);
      }
      const selectedIds = context.values.optionIds ?? [];
      if (selectedIds.length !== 1) {
        throw new AppError("VALIDATION_ERROR", "请选择且只能选择一个候选选题。", 400);
      }
      const candidate = context.card.candidates.find((item) => item.id === selectedIds[0]);
      if (!candidate) {
        throw new AppError("VALIDATION_ERROR", "候选选题不存在或已失效。", 400);
      }
      const existing = await prisma.idea.findFirst({
        where: {
          userId: context.userId,
          evidence: { path: ["sourceCardId"], equals: context.card.id },
        },
      });
      const idea =
        existing ??
        (await prisma.idea.create({
          data: {
            userId: context.userId,
            source: "manual",
            title: candidate.title,
            angle: candidate.angle,
            audience: candidate.audience,
            notes: candidate.reason,
            evidence: {
              source: "conversation_ai",
              sourceCardId: context.card.id,
              direction: context.card.direction,
              directionSelection: context.card.directionSelection,
            },
          },
        }));
      const brief = buildSelectedIdeaBrief({
        originalBrief: context.card.brief,
        direction: context.card.direction,
        uiLocale: context.card.uiLocale,
        candidate,
      });
      return {
        text:
          context.card.uiLocale === "zh-CN"
            ? `已把「${candidate.title}」保存到你的选题库。接下来确认创作平台、内容语言和 Skill。`
            : `“${candidate.title}” is saved to your private idea library. Now confirm platforms, content language and Skills.`,
        cards: [
          await buildCreationSetupCard({
            userId: context.userId,
            conversationId: context.conversationId,
            brief,
            directionSelection: context.card.directionSelection,
            directionSummary: {
              primaryLabel: context.card.primaryDirectionLabel ?? context.card.direction,
              ...(context.card.secondaryDirectionLabel
                ? { secondaryLabel: context.card.secondaryDirectionLabel }
                : {}),
            },
            uiLocale: context.card.uiLocale,
            nonce: `${context.card.id}:${idea.id}`,
          }),
        ],
        command: "idea.save",
      };
    },
  },

  "idea.skip": {
    repeatable: false,
    execute: async (context) => {
      if (context.card.type !== "idea_candidates") {
        throw new AppError("VALIDATION_ERROR", "选题候选卡类型不匹配。", 400);
      }
      return {
        text:
          context.card.uiLocale === "zh-CN"
            ? "已跳过候选选题。直接确认这次创作的平台、内容语言和 Skill。"
            : "Idea selection skipped. Configure platforms, content language and Skills directly.",
        cards: [
          await buildCreationSetupCard({
            userId: context.userId,
            conversationId: context.conversationId,
            brief: [context.card.brief, context.card.direction].join("\n"),
            directionSelection: context.card.directionSelection,
            directionSummary: {
              primaryLabel: context.card.primaryDirectionLabel ?? context.card.direction,
              ...(context.card.secondaryDirectionLabel
                ? { secondaryLabel: context.card.secondaryDirectionLabel }
                : {}),
            },
            uiLocale: context.card.uiLocale,
            nonce: `${context.card.id}:skip`,
          }),
        ],
        command: "idea.skip",
      };
    },
  },

  /** 对话式创作确认卡：重新校验卡内白名单与当前用户 Skill 后创建真实批量任务。 */
  "creation.generate_bundle": {
    repeatable: false,
    execute: async (context) => {
      if (context.card.type !== "creation_setup") {
        throw new AppError("VALIDATION_ERROR", "创作设置卡类型不匹配。", 400);
      }
      const selected = new Set(context.values.optionIds ?? []);
      const targetPlatforms = context.card.platformOptions
        .map((option) => option.id)
        .filter((id) => selected.has(id));
      const targetLocales = context.card.localeOptions
        .map((option) => option.id)
        .filter((id) => selected.has(id));
      const skillIds = context.card.skillOptions
        .map((option) => option.id)
        .filter((id) => selected.has(id));
      const accountBindings = Object.fromEntries(
        context.card.accountOptions.flatMap((account) =>
          selected.has(`account:${account.platform}:${account.id}`)
            ? [[account.platform, account.id]]
            : [],
        ),
      );
      if (!targetPlatforms.length || targetPlatforms.length > context.card.maxPlatforms) {
        throw new AppError("VALIDATION_ERROR", "请选择 1–5 个目标平台。", 400);
      }
      if (targetLocales.length !== 1) {
        throw new AppError("VALIDATION_ERROR", "请选择且只能选择一种内容语言。", 400);
      }
      const result = await createGenerationBatch({
        userId: context.userId,
        conversationId: context.conversationId,
        input: {
          brief: context.card.brief,
          directionSelection: context.card.directionSelection,
          targetPlatforms,
          targetLocale: targetLocales[0],
          skillIds,
          accountBindings,
        },
        idempotencyKey: `chat:${context.card.id}`,
        uiLocale: context.card.uiLocale,
      });
      const createdCount = result.items.filter((item) => item.jobId).length;
      return {
        text:
          context.card.uiLocale === "zh-CN"
            ? `已创建 ${createdCount} 个独立创作任务。每个平台可以分别查看、重试和编辑。`
            : `Created ${createdCount} independent tasks. Each platform can be viewed, retried and edited separately.`,
        command: "content.generate_bundle",
      };
    },
  },

  /** 审批卡:确认 */
  "approval.confirm": {
    repeatable: false,
    execute: (context) => ({
      text: `已确认「${context.card.type === "approval" ? context.card.title : "该操作"}」。`,
      cards: [
        {
          id: `notice-${context.sourceMessageId.slice(-8)}-confirm`,
          version: 1,
          type: "notice",
          tone: "success",
          title: "操作已确认",
          body: "确认记录已保存;实际执行会在对应能力上线后进行,不会静默替你操作。",
        },
      ],
    }),
  },

  /** 审批卡:取消 */
  "approval.cancel": {
    repeatable: false,
    execute: (context) => ({
      text: `已取消「${context.card.type === "approval" ? context.card.title : "该操作"}」,没有执行任何变更。`,
      cards: [
        {
          id: `notice-${context.sourceMessageId.slice(-8)}-cancel`,
          version: 1,
          type: "notice",
          tone: "info",
          title: "操作已取消",
        },
      ],
    }),
  },

  /** 参考卡:一键按结构生成原创稿(创建内容项目 + ContentReference + content.generate) */
  "reference.generate_original": {
    repeatable: false,
    execute: async (context) => {
      const reference = await loadReferenceContext(context);
      if (
        GLOBAL_PLATFORM_IDS.includes(reference.platform) &&
        !isForeignPlatformCreationEnabled()
      ) {
        throw new AppError(
          "FEATURE_DISABLED",
          "国外平台创作功能尚未在当前环境开启。",
          404,
        );
      }
      const generationKey = `reference-original:${reference.jobId}`;

      // 双保险幂等:动作级(C3 幂等键)之外,再按导入任务级 key 复用既有生成任务
      const existingJob = await prisma.processingJob.findUnique({
        where: {
          userId_type_idempotencyKey: {
            userId: context.userId,
            type: JobType.analysis,
            idempotencyKey: generationKey,
          },
        },
      });
      if (existingJob) {
        const input = existingJob.input as { contentId?: string };
        return {
          text: "这条参考已经在生成原创稿了,不会重复创建。",
          cards: [
            {
              id: `card-gen-${existingJob.id}`,
              version: 1,
              type: "progress",
              jobId: existingJob.id,
              title: "参考结构生成原创稿",
              display: "compact",
              cancelable: true,
            },
          ],
          command: `content.generate:${input.contentId ?? ""}`,
        };
      }

      const skillSelection = await resolveConversationSkills({
        userId: context.userId,
        conversationId: context.conversationId,
      });

      const conversation = await prisma.conversation.findFirst({
        where: { id: context.conversationId, userId: context.userId },
        select: { targetLocale: true },
      });
      const definition = PLATFORM_DEFINITIONS[reference.platform];
      const content = await prisma.generatedContent.create({
        data: {
          userId: context.userId,
          conversationId: context.conversationId,
          ideaId: reference.ideaId,
          platform: reference.platform,
          contentKind: definition.contentKind,
          contentLocale: isContentLocale(conversation?.targetLocale)
            ? conversation.targetLocale
            : "zh-CN",
          outputType: definition.contentKind,
          title: reference.brief.source.title
            ? `参考「${reference.brief.source.title.slice(0, 30)}」的原创稿`
            : "参考结构原创稿",
          inputType: "idea",
          inputText: reference.brief.summary,
          selectedSkillIds: skillSelection.ids,
          skillSnapshots: skillSelection.snapshots.length
            ? skillSnapshotsJson(skillSelection.snapshots)
            : undefined,
        },
      });

      await prisma.contentReference.create({
        data: {
          userId: context.userId,
          contentId: content.id,
          benchmarkNoteId: reference.benchmarkNoteId,
          ideaId: reference.ideaId,
          role: "structure",
          sourceUrl: reference.sourceUrl,
          fingerprint: urlFingerprint(context.userId, reference.sourceUrl),
          snapshot: reference.brief as unknown as Prisma.InputJsonValue,
        },
      });

      const job = await enqueueJob({
        userId: context.userId,
        type: JobType.analysis,
        action: "content.generate",
        input: {
          contentId: content.id,
          conversationId: context.conversationId,
          skillIds: skillSelection.ids,
        },
        idempotencyKey: generationKey,
      });

      return {
        text: "已按参考结构创建内容项目,正在生成原创稿;完成后会以成果卡出现在这条消息流里。生成只读取脱敏后的参考摘要,不会照抄原文。",
        cards: [
          {
            id: `card-gen-${job.id}`,
            version: 1,
            type: "progress",
            jobId: job.id,
            title: "参考结构生成原创稿",
            display: "compact",
            cancelable: true,
          },
        ],
        command: `content.generate:${content.id}`,
      };
    },
  },

  /** 参考卡:提炼为选题(网页导入本身已是 Idea 时直接复用) */
  "reference.extract_idea": {
    repeatable: false,
    execute: async (context) => {
      const reference = await loadReferenceContext(context);
      if (reference.ideaId) {
        return {
          text: "这条参考在导入时已经保存为选题,可以直接在选题库里使用。",
        };
      }
      const existing = await prisma.idea.findFirst({
        where: {
          userId: context.userId,
          source: "reference",
          evidence: { path: ["sourceUrl"], equals: reference.sourceUrl },
        },
      });
      if (existing) {
        return { text: `选题「${existing.title}」已经存在,不再重复创建。` };
      }
      const idea = await prisma.idea.create({
        data: {
          userId: context.userId,
          source: "reference",
          status: "saved",
          platform: reference.platform,
          title: reference.brief.source.title ?? "参考选题",
          angle: reference.brief.corePoints[0] ?? null,
          notes: reference.brief.summary,
          evidence: {
            sourceUrl: reference.sourceUrl,
            briefFingerprint: reference.brief.provenance.fingerprint,
            structure: reference.brief.structure,
          } as Prisma.InputJsonValue,
        },
      });
      return {
        text: `已提炼为选题「${idea.title}」,可以在选题库中继续规划。`,
      };
    },
  },

  /** 参考卡:查看证据(结构、事实与边界,全部来自脱敏 Brief) */
  "reference.view_evidence": {
    repeatable: false,
    execute: async (context) => {
      const reference = await loadReferenceContext(context);
      const lines = [
        `来源:${reference.brief.source.title ?? reference.sourceUrl}(${reference.brief.source.platform})`,
        "",
        "内容结构:",
        ...reference.brief.structure.slice(0, 8),
        "",
        `开场方式:${reference.brief.opening || "未提取"}`,
        `情绪与节奏:${reference.brief.emotionAndPacing}`,
        "",
        ...(reference.brief.facts.length
          ? ["可引用事实:", ...reference.brief.facts.map((fact) => `· ${fact.excerpt}`)]
          : ["可引用事实:未提取到带数据的句子"]),
        "",
        "不可模仿边界:",
        ...reference.brief.boundaries.map((item) => `· ${item}`),
      ];
      return { text: lines.join("\n") };
    },
  },

  /** 参考卡:加入参考集(能力未上线,如实说明,不假成功) */
  "reference.add_to_collection": {
    repeatable: false,
    execute: async () => ({
      text: "「加入参考集」还没有上线,本次没有做任何更改;当前可以先用「提炼为选题」把它保存到选题库。",
      cards: [
        {
          id: "notice-collection-pending",
          version: 1,
          type: "notice",
          tone: "warning",
          title: "参考集能力即将支持",
        },
      ],
    }),
  },

  /** 参考卡:构建风格画像(能力未上线,如实说明,不假成功) */
  "reference.add_to_style_profile": {
    repeatable: false,
    execute: async () => ({
      text: "「构建风格画像」需要多条参考与人工确认流程,该入口尚未接入对话;本次没有做任何更改。",
      cards: [
        {
          id: "notice-style-pending",
          version: 1,
          type: "notice",
          tone: "warning",
          title: "风格画像入口即将支持",
        },
      ],
    }),
  },

  /** 成果卡:打开编辑(面板由客户端本地打开;此处是 API 直连时的兜底说明) */
  "artifact.open": {
    repeatable: true,
    execute: async (context) => {
      if (context.card.type !== "artifact") {
        throw new AppError("VALIDATION_ERROR", "该动作只能由成果卡触发。", 400);
      }
      return {
        text: `「${context.card.title}」当前为版本 v${context.card.revisionNumber}。在创作页点击成果卡上的「打开编辑」即可在右侧编辑器中查看内容、结构、评分与证据。`,
      };
    },
  },

  /** 成果卡:继续优化(客户端会把意图预填到输入框;此处是 API 直连时的兜底说明) */
  "artifact.refine": {
    repeatable: true,
    execute: async (context) => {
      if (context.card.type !== "artifact") {
        throw new AppError("VALIDATION_ERROR", "该动作只能由成果卡触发。", 400);
      }
      return {
        text: `想继续优化「${context.card.title}」,请直接在对话中描述要修改的方向,例如“把开头改得更具体”或“压缩第 3 页”。`,
      };
    },
  },

  /** 补丁卡:应用提案 → 基于被提案版本创建新 ContentRevision(C7)。 */
  "patch.apply": {
    repeatable: false,
    execute: async (context) => {
      if (context.card.type !== "patch") {
        throw new AppError("VALIDATION_ERROR", "该动作只能由修改提案卡触发。", 400);
      }
      const card = context.card;
      const content = await prisma.generatedContent.findFirst({
        where: { id: card.contentId, userId: context.userId },
        include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } },
      });
      if (!content) {
        throw new AppError("NOT_FOUND", "内容项目不存在,或不属于当前账号。", 404);
      }
      const latest = content.revisions[0];
      if (!latest) {
        throw new AppError("VALIDATION_ERROR", "该内容项目没有可应用的版本。", 400);
      }

      // 安全拦截:提案基于的版本已不是最新版时不应用,提示重新发起;绝不覆盖后来产生的修改
      if (latest.id !== card.revisionId) {
        return {
          text: `没有应用这条提案:它基于 v${card.revisionNumber},而内容已经更新到 v${latest.revisionNumber}。请在最新版本上重新发起「让星迹修改」,历史版本都完整保留。`,
          cards: [
            {
              id: `notice-patch-stale-${context.sourceMessageId.slice(-8)}`,
              version: 1,
              type: "notice",
              tone: "warning",
              title: "提案已过期,未做任何修改",
              body: `提案基于 v${card.revisionNumber},当前最新为 v${latest.revisionNumber}。`,
            },
          ],
        };
      }

      const contentKind = content.contentKind as "xhs_graphic" | "douyin_video_script";
      const patched = applyRevisionSectionPatch(
        {
          title: latest.title,
          bodyText: latest.bodyText,
          structuredContent: latest.structuredContent,
        },
        card.section,
        card.before,
        card.after,
      );
      if (!patched) {
        return {
          text: `没有应用这条提案:「${card.sectionLabel}」的文本与提案时不一致,可能已被手动编辑。请重新发起修改,不会丢失任何已有内容。`,
          cards: [
            {
              id: `notice-patch-miss-${context.sourceMessageId.slice(-8)}`,
              version: 1,
              type: "notice",
              tone: "warning",
              title: "区块内容已变化,未做任何修改",
            },
          ],
        };
      }

      const payload = buildManualRevisionPayload({
        contentKind,
        baseStructuredContent: patched.structured,
        title: patched.title,
        bodyText: patched.body,
      });
      const revision = await createContentRevision(
        context.userId,
        content.id,
        { source: "manual", ...payload },
        {
          provenance: {
            type: "patch_apply",
            origin: "local_preview",
            skillId: card.skillId,
            instruction: card.instruction.slice(0, 500),
            section: card.section,
            baseRevisionId: card.revisionId,
            baseRevisionNumber: card.revisionNumber,
          } as Prisma.InputJsonValue,
        },
      );

      return {
        text: `已把「${card.sectionLabel}」的修改提案应用为新版本 v${revision.revisionNumber};v${card.revisionNumber} 及之前的版本都在版本历史中,可随时恢复。`,
        cards: [
          {
            id: `card-artifact-patch-${revision.id.slice(-12)}`,
            version: 1,
            type: "artifact",
            contentId: content.id,
            revisionId: revision.id,
            revisionNumber: revision.revisionNumber,
            platform: content.platform as "xiaohongshu" | "douyin",
            contentKind,
            title: revision.title ?? content.title ?? "未命名内容",
            preview: (revision.bodyText ?? "").slice(0, 200) || undefined,
            actions: [
              { actionId: "artifact.open", label: "打开编辑", appearance: "primary", repeatable: true },
              { actionId: "artifact.refine", label: "继续优化", repeatable: true },
              { actionId: "publish.prepare", label: "准备发布", repeatable: true },
            ],
          },
        ],
        command: "content.apply_patch",
      };
    },
  },

  /** 补丁卡:忽略提案(不做任何修改)。 */
  "patch.dismiss": {
    repeatable: false,
    execute: (context) => {
      if (context.card.type !== "patch") {
        throw new AppError("VALIDATION_ERROR", "该动作只能由修改提案卡触发。", 400);
      }
      return {
        text: `已忽略「${context.card.sectionLabel}」的修改提案,内容没有任何变化。`,
      };
    },
  },

  /**
   * 成果卡/就绪卡:发起或重新发起发布就绪检查(C8)。
   * 只读评估最新已保存版本,产出新的就绪卡;不创建发布记录、不调用供应商。
   */
  "publish.prepare": {
    repeatable: true,
    execute: async (context) => {
      if (context.card.type !== "artifact" && context.card.type !== "publish_readiness") {
        throw new AppError("VALIDATION_ERROR", "该动作只能由成果卡或发布就绪卡触发。", 400);
      }
      return buildPublishReadinessReply({
        userId: context.userId,
        contentId: context.card.contentId,
        cardIdSuffix: `${context.sourceMessageId.slice(-8)}-${Date.now().toString(36)}`,
      });
    },
  },

  /**
   * 就绪卡:用户显式确认移交发布中心(C8)。
   * 非重复动作:同一张卡重复确认由幂等键兜底,只执行一次、返回首次结果。
   * 服务端重新校验归属、版本新旧与阻塞项;不创建发布记录、不调用供应商。
   */
  "publish.confirm_handoff": {
    repeatable: false,
    execute: async (context) => {
      if (context.card.type !== "publish_readiness") {
        throw new AppError("VALIDATION_ERROR", "该动作只能由发布就绪卡触发。", 400);
      }
      return confirmPublishHandoff({
        userId: context.userId,
        card: context.card,
        sourceMessageId: context.sourceMessageId,
      });
    },
  },

  /** 就绪卡:打开检查清单(客户端本地打开 Artifact 清单;此处是 API 直连时的兜底说明)。 */
  "publish.open_checklist": {
    repeatable: true,
    execute: (context) => {
      if (context.card.type !== "publish_readiness") {
        throw new AppError("VALIDATION_ERROR", "该动作只能由发布就绪卡触发。", 400);
      }
      return {
        text: `「${context.card.title}」的逐项检查清单在创作页右侧编辑器中:点击就绪卡上的「打开检查清单」即可查看阻塞、提醒与已通过项。`,
      };
    },
  },

  /** 就绪卡:把待处理项转成修改指令(客户端本地预填输入框;此处是 API 直连时的兜底)。 */
  "publish.copy_missing": {
    repeatable: true,
    execute: (context) => {
      if (context.card.type !== "publish_readiness") {
        throw new AppError("VALIDATION_ERROR", "该动作只能由发布就绪卡触发。", 400);
      }
      const prompt = missingItemsPrompt(context.card.items);
      return {
        text: prompt || "当前没有待处理项,可以直接确认移交发布中心。",
      };
    },
  },

  /** 结果卡:打开发布中心(客户端本地跳转 /publish;此处是 API 直连时的兜底说明)。 */
  "publish.open_workspace": {
    repeatable: true,
    execute: () => ({
      text: "请在左侧导航打开「发布」进入发布中心:核对内容版本、选择账号、上传素材后手动确认发布;系统不会自动发布。",
    }),
  },

  /** 连接引导:打开连接设置(客户端本地跳转 /settings/connections;此处是兜底说明)。 */
  "connection.open": {
    repeatable: true,
    execute: () => ({
      text: "请在「设置 → 连接」中配置 AiToEarn 凭证并完成账号授权;配置完成后回到就绪卡点「重新检查」。",
    }),
  },

  /** 参考卡:重新导入(可重复;每次动作各自幂等) */
  "reference.retry": {
    repeatable: true,
    execute: async (context) => {
      if (context.card.type !== "reference") {
        throw new AppError("VALIDATION_ERROR", "该动作只能由参考卡触发。", 400);
      }
      const safeUrl = await assertUrlSafe(context.card.sourceUrl);
      const job = await enqueueJob({
        userId: context.userId,
        type: JobType.ingest,
        action: "reference.import",
        input: { url: safeUrl, conversationId: context.conversationId },
        idempotencyKey: createHash("sha256")
          .update(`${context.userId}:${safeUrl}:retry:${context.sourceMessageId}:${context.action.actionId}`)
          .digest("hex"),
      });
      return {
        text: "已重新发起导入。",
        cards: [
          {
            id: `card-ref-${job.id}`,
            version: 1,
            type: "reference",
            state: "importing",
            sourceUrl: safeUrl,
            platform: context.card.platform,
            jobId: job.id,
            actions: context.card.actions,
          },
        ],
      };
    },
  },
};

export function getActionHandler(actionId: string): ActionHandler | null {
  return Object.prototype.hasOwnProperty.call(ACTION_REGISTRY, actionId)
    ? ACTION_REGISTRY[actionId]
    : null;
}

function toNullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
