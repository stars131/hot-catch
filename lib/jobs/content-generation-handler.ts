import { Prisma } from "@prisma/client";
import { isAppError } from "@/lib/errors";
import { registerJobHandler } from "@/lib/jobs/handlers";
import type { JobHandler } from "@/lib/jobs/types";
import { prisma } from "@/lib/prisma";
import { createLlmProvider } from "@/lib/providers/factory";
import { createContentRevision } from "@/lib/services/content-project-service";
import { scoreContentProject } from "@/lib/services/scoring-service";
import { CHAT_PROTOCOL } from "@/lib/creator/chat-protocol";
import { chatMessageMetadataV1Schema } from "@/lib/creator/chat-schemas";
import type { ReferenceBrief } from "@/lib/creator/reference-brief";
import {
  resolveConversationSkills,
  skillSnapshotsJson,
} from "@/lib/services/skill-service";
import {
  getPlatformServerDefinition,
  type NormalizedGeneratedContent,
} from "@/lib/platforms/server-registry";
import {
  isContentKindId,
  isContentLocale,
  isUiLocale,
  type ContentKindId,
  type ContentLocale,
  type PlatformId,
  type UiLocale,
} from "@/lib/platforms/registry";

const contentGenerationHandler: JobHandler = async (payload, reportProgress) => {
  const input = payload.input as {
    contentId?: string;
    conversationId?: string;
    skillIds?: string[];
    uiLocale?: string;
  };
  if (!input.contentId) throw new Error("contentId is required");

  const content = await prisma.generatedContent.findFirst({
    where: { id: input.contentId, userId: payload.userId },
    include: {
      idea: true,
      persona: true,
      styleProfile: { include: { evidence: { take: 20 } } },
    },
  });
  if (!content) throw new Error("内容项目不存在或不属于当前用户。");
  if (!isContentKindId(content.contentKind)) {
    throw new Error(`Unsupported content kind: ${content.contentKind}`);
  }
  if (content.styleProfile && content.styleProfile.status !== "approved") {
    return {
      finalStatus: "waiting_input",
      output: {
        reason: "STYLE_PROFILE_NOT_APPROVED",
        message: "风格画像尚未人工确认。",
      },
    };
  }

  const conversationId = input.conversationId ?? content.conversationId;
  const skillSelection = await resolveConversationSkills({
    userId: payload.userId,
    conversationId,
    skillIds: input.skillIds ?? content.selectedSkillIds,
  });

  let provider;
  try {
    provider = await createLlmProvider(payload.userId);
  } catch (error) {
    if (
      isAppError(error) &&
      (error.code === "CREDENTIAL_NOT_CONFIGURED" ||
        error.code === "CREDENTIAL_INVALID")
    ) {
      return {
        finalStatus: "waiting_input",
        output: {
          reason: "LLM_CREDENTIAL_REQUIRED",
          message: "请先配置并选择一个真实可用的默认模型。",
        },
      };
    }
    throw error;
  }

  await reportProgress(20, "整理选题、参考资料与 Skill");
  const references = await prisma.contentReference.findMany({
    where: { contentId: content.id, userId: payload.userId },
    select: { snapshot: true },
    take: 10,
  });
  const referenceBriefs = references
    .map((item) => item.snapshot as unknown as ReferenceBrief)
    .filter((brief) => brief && typeof brief === "object");

  const context = {
    idea: content.idea
      ? {
          title: content.idea.title,
          angle: content.idea.angle,
          audience: content.idea.audience,
          notes: content.idea.notes,
        }
      : { title: content.title, notes: content.inputText },
    persona: content.persona,
    styleProfile: content.styleProfile
      ? {
          summary: content.styleProfile.summary,
          themes: content.styleProfile.themes,
          hooks: content.styleProfile.hooks,
          pacing: content.styleProfile.pacing,
          tone: content.styleProfile.tone,
          visualLanguage: content.styleProfile.visualLanguage,
          boundaries: content.styleProfile.boundaries,
          evidence: content.styleProfile.evidence.map((item) => ({
            dimension: item.dimension,
            insight: item.insight,
            excerpt: item.excerpt,
          })),
        }
      : null,
    references: referenceBriefs,
  };

  const targetLocale: ContentLocale = isContentLocale(content.contentLocale)
    ? content.contentLocale
    : "zh-CN";
  const uiLocale: UiLocale = isUiLocale(input.uiLocale) ? input.uiLocale : "zh-CN";
  const definition = getPlatformServerDefinition(content.contentKind);
  const prompt = definition.buildPrompt({
    context,
    targetLocale,
    uiLocale,
    skillInstruction: skillSelection.promptInstruction,
  });

  await reportProgress(45, "生成结构化初稿");
  try {
    const generated = await provider.generateStructured({
      system: prompt.system,
      prompt: prompt.prompt,
      schema: definition.schema,
    });
    const parsed = definition.schema.parse(generated);
    const normalized = definition.normalize(parsed);

    const revision = await createContentRevision(
      payload.userId,
      content.id,
      {
        source: "generated",
        title: normalized.title,
        bodyText: normalized.bodyText,
        structuredContent: parsed,
        fullMarkdown: normalized.fullMarkdown,
      },
      {
        originJobId: payload.databaseJobId,
        provenance: {
          promptVersion: definition.promptVersion,
          provider: provider.name,
          model: provider.model,
          targetLocale,
          skills: skillSelection.snapshots,
        } as unknown as Prisma.InputJsonValue,
      },
    );

    await prisma.generatedContent.update({
      where: { id: content.id },
      data: {
        ...legacyFields(content.contentKind, parsed),
        scriptSpec: toJson(parsed),
        tags: normalized.tags,
        riskNotes: normalized.riskNotes.join("\n"),
        modelName: `${provider.name}/${provider.model}`,
        promptVersion: definition.promptVersion,
        selectedSkillIds: skillSelection.ids,
        skillSnapshots: skillSelection.snapshots.length
          ? skillSnapshotsJson(skillSelection.snapshots)
          : Prisma.JsonNull,
      },
    });

    const score = await scoreIfSupported(
      payload.userId,
      content.id,
      content.contentKind,
      reportProgress,
    );
    await appendArtifactMessage({
      userId: payload.userId,
      conversationId,
      jobId: payload.databaseJobId,
      contentId: content.id,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      platform: definition.platform,
      contentKind: content.contentKind,
      contentLocale: targetLocale,
      normalized,
      score,
    });

    return {
      resultType: "contentRevision",
      resultId: revision.id,
      output: {
        contentId: content.id,
        platform: definition.platform,
        contentLocale: targetLocale,
        revisionId: revision.id,
        ...(score === undefined ? {} : { score }),
      },
    };
  } catch (error) {
    if (
      isAppError(error) &&
      error.code === "AI_GENERATION_FAILED" &&
      error.statusCode === 422
    ) {
      return {
        finalStatus: "waiting_input",
        output: { reason: "STRUCTURED_OUTPUT_INVALID", message: error.message },
      };
    }
    throw error;
  }
};

function legacyFields(
  contentKind: ContentKindId,
  generated: unknown,
): Prisma.GeneratedContentUpdateInput {
  const value = asRecord(generated);
  if (contentKind === "xhs_graphic") {
    return {
      generatedTitleOptions: toJson(value.titleOptions),
      coverTextOptions: toJson(value.coverTextOptions),
      pageStructure: toJson(value.pages),
      interactionEnding:
        typeof value.interactionEnding === "string" ? value.interactionEnding : null,
    };
  }
  return {};
}

async function scoreIfSupported(
  userId: string,
  contentId: string,
  contentKind: ContentKindId,
  reportProgress: (progress: number, stage: string) => Promise<void>,
): Promise<number | undefined> {
  if (contentKind !== "xhs_graphic" && contentKind !== "douyin_video_script") {
    await reportProgress(85, "执行平台格式检查");
    return undefined;
  }
  await reportProgress(85, "执行发布前评分");
  const scoring = await scoreContentProject(userId, contentId);
  return scoring.score.total;
}

async function appendArtifactMessage(params: {
  userId: string;
  conversationId: string | null;
  jobId: string;
  contentId: string;
  revisionId: string;
  revisionNumber: number;
  platform: PlatformId;
  contentKind: ContentKindId;
  contentLocale: ContentLocale;
  normalized: NormalizedGeneratedContent;
  score?: number;
}) {
  if (!params.conversationId) return;
  const conversation = await prisma.conversation.findFirst({
    where: { id: params.conversationId, userId: params.userId },
  });
  if (!conversation) return;

  const metadata = chatMessageMetadataV1Schema.parse({
    protocol: CHAT_PROTOCOL,
    cards: [
      {
        id: `card-artifact-${params.jobId}`,
        version: 1,
        type: "artifact",
        contentId: params.contentId,
        revisionId: params.revisionId,
        revisionNumber: params.revisionNumber,
        platform: params.platform,
        contentKind: params.contentKind,
        contentLocale: params.contentLocale,
        title: params.normalized.title,
        preview: params.normalized.bodyText.slice(0, 200),
        score: params.score,
        actions: [
          {
            actionId: "artifact.open",
            label: "打开编辑",
            appearance: "primary",
            repeatable: true,
          },
          {
            actionId: "artifact.refine",
            label: "继续优化",
            repeatable: true,
          },
          ...(params.platform === "xiaohongshu" || params.platform === "douyin"
            ? [
                {
                  actionId: "publish.prepare",
                  label: "准备发布",
                  repeatable: true,
                },
              ]
            : []),
        ],
      },
    ],
  });
  const scoreSuffix =
    typeof params.score === "number" ? `，评分 ${params.score}/100` : "";
  try {
    await prisma.message.create({
      data: {
        conversationId: params.conversationId,
        role: "assistant",
        content: `原创稿已生成：「${params.normalized.title}」（v${params.revisionNumber}${scoreSuffix}）。`,
        status: "complete",
        clientMessageId: `artifact:${params.jobId}`,
        metadata: metadata as unknown as Prisma.InputJsonValue,
      },
    });
    await prisma.conversation.update({
      where: { id: params.conversationId },
      data: { updatedAt: new Date() },
    });
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
    ) {
      throw error;
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

registerJobHandler("content.generate", contentGenerationHandler);
