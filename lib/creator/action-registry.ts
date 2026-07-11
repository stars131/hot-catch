import { JobType, Prisma } from "@prisma/client";
import type { CardAction, ChatCard } from "@/lib/creator/chat-protocol";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
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
import { assertUrlSafe } from "@/lib/security/url-guard";
import { createHash } from "node:crypto";

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

/** 参考动作共用:从卡片解析导入任务并加载脱敏 Brief;严禁读取客户端提交的实体 ID。 */
async function loadReferenceContext(context: ActionContext): Promise<{
  jobId: string;
  sourceUrl: string;
  brief: ReferenceBrief;
  platform: "xiaohongshu" | "douyin";
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
    return {
      jobId: job.id,
      sourceUrl: context.card.sourceUrl,
      brief: buildBriefFromIdea(idea, "basic_fetch"),
      platform: "xiaohongshu",
      ideaId: idea.id,
    };
  }
  throw new AppError("VALIDATION_ERROR", "该导入结果不支持此动作。", 400);
}

export const ACTION_REGISTRY: Record<string, ActionHandler> = {
  /** 选项卡:确认内容方向 */
  "direction.choose": {
    repeatable: false,
    execute: (context) => {
      const labels = requireOptionLabels(context);
      return {
        text: `好的,方向定为「${labels.join("、")}」。接下来请补充主题、目标读者和想传递的核心价值,我会按这个方向整理创作思路;链接导入与初稿生成会在后续版本接入创作流程。`,
        command: "content.create",
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

      const content = await prisma.generatedContent.create({
        data: {
          userId: context.userId,
          conversationId: context.conversationId,
          ideaId: reference.ideaId,
          platform: reference.platform,
          contentKind: reference.platform === "douyin" ? "douyin_video_script" : "xhs_graphic",
          title: reference.brief.source.title
            ? `参考「${reference.brief.source.title.slice(0, 30)}」的原创稿`
            : "参考结构原创稿",
          inputType: "idea",
          inputText: reference.brief.summary,
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
        input: { contentId: content.id, conversationId: context.conversationId },
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
