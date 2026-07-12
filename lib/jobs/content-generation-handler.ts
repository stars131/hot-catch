import { Prisma } from "@prisma/client";
import { isAppError } from "@/lib/errors";
import { registerJobHandler } from "@/lib/jobs/handlers";
import type { JobHandler } from "@/lib/jobs/types";
import { prisma } from "@/lib/prisma";
import { createLlmProvider } from "@/lib/providers/factory";
import {
  douyinVideoScriptOutputSchema,
  xhsGraphicOutputSchema,
} from "@/lib/content/schemas";
import { createContentRevision } from "@/lib/services/content-project-service";
import { toDouyinMarkdown, toXhsMarkdown } from "@/lib/content/markdown";
import { scoreContentProject } from "@/lib/services/scoring-service";
import { CHAT_PROTOCOL } from "@/lib/creator/chat-protocol";
import { chatMessageMetadataV1Schema } from "@/lib/creator/chat-schemas";
import {
  REFERENCE_GUARD_INSTRUCTION,
  type ReferenceBrief,
} from "@/lib/creator/reference-brief";

const contentGenerationHandler: JobHandler = async (payload, reportProgress) => {
  const input = payload.input as { contentId?: string; conversationId?: string };
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
  if (content.styleProfile && content.styleProfile.status !== "approved") {
    return {
      finalStatus: "waiting_input",
      output: { reason: "STYLE_PROFILE_NOT_APPROVED", message: "风格画像尚未人工确认。" },
    };
  }

  let provider;
  try {
    provider = await createLlmProvider(payload.userId);
  } catch (error) {
    if (isAppError(error) && error.code === "CREDENTIAL_NOT_CONFIGURED") {
      return {
        finalStatus: "waiting_input",
        output: { reason: "DEEPSEEK_CREDENTIAL_REQUIRED", message: "请先配置 DeepSeek 凭证。" },
      };
    }
    throw error;
  }

  await reportProgress(20, "整理选题与风格证据");
  // 参考材料只读取脱敏 Brief(ContentReference.snapshot),不读取供应商 rawData
  const references = await prisma.contentReference.findMany({
    where: { contentId: content.id, userId: payload.userId },
    select: { snapshot: true },
    take: 5,
  });
  const referenceBriefs = references
    .map((item) => item.snapshot as unknown as ReferenceBrief)
    .filter((brief) => brief && typeof brief === "object");

  const context = {
    idea: content.idea
      ? { title: content.idea.title, angle: content.idea.angle, audience: content.idea.audience, notes: content.idea.notes }
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

  await reportProgress(45, "生成结构化初稿");
  try {
    if (content.contentKind === "xhs_graphic") {
      const generated = await provider.generateStructured({
        system:
          "你是小红书图文编辑。根据选题、人设和已审核风格画像生成原创内容,不冒充参考创作者,不照抄证据。只返回符合字段要求的 JSON。" +
          REFERENCE_GUARD_INSTRUCTION,
        prompt: `${JSON.stringify(context)}\n生成标题候选、封面文案、逐页图文、完整正文、标签、互动收尾和风险说明。`,
        schema: xhsGraphicOutputSchema,
      });
      const revision = await createContentRevision(
        payload.userId,
        content.id,
        {
          source: "generated",
          title: generated.title,
          bodyText: generated.bodyText,
          structuredContent: generated,
          fullMarkdown: toXhsMarkdown(generated),
        },
        { originJobId: payload.databaseJobId },
      );
      await prisma.generatedContent.update({
        where: { id: content.id },
        data: {
          generatedTitleOptions: generated.titleOptions,
          coverTextOptions: generated.coverTextOptions,
          pageStructure: generated.pages,
          tags: generated.tags,
          interactionEnding: generated.interactionEnding,
          riskNotes: generated.riskNotes.join("\n"),
          modelName: "deepseek",
          promptVersion: "content-xhs-v1",
        },
      });
      await reportProgress(85, "执行发布前评分");
      const scoring = await scoreContentProject(payload.userId, content.id);
      await appendArtifactMessage({
        userId: payload.userId,
        conversationId: input.conversationId ?? content.conversationId,
        jobId: payload.databaseJobId,
        contentId: content.id,
        revisionId: revision.id,
        revisionNumber: revision.revisionNumber,
        platform: "xiaohongshu",
        contentKind: "xhs_graphic",
        title: generated.title,
        preview: generated.bodyText.slice(0, 200),
        score: scoring.score.total,
      });
      return {
        resultType: "contentRevision",
        resultId: revision.id,
        output: { contentId: content.id, score: scoring.score.total },
      };
    }

    const generated = await provider.generateStructured({
      system:
        "你是抖音短视频编导。生成精确到秒且连续的分镜脚本,不自动成片,不冒充参考创作者。每镜必须包含口播、画面、字幕、镜头、转场、音乐和风险字段,只返回 JSON。" +
        REFERENCE_GUARD_INSTRUCTION,
      prompt: `${JSON.stringify(context)}\n生成 10–180 秒的原创短视频脚本，第一镜从 0 秒开始，最后一镜结束时间等于总时长。`,
      schema: douyinVideoScriptOutputSchema,
    });
    const revision = await createContentRevision(
      payload.userId,
      content.id,
      {
        source: "generated",
        title: generated.title,
        bodyText: generated.caption,
        structuredContent: generated,
        fullMarkdown: toDouyinMarkdown(generated),
      },
      { originJobId: payload.databaseJobId },
    );
    await prisma.generatedContent.update({
      where: { id: content.id },
      data: {
        scriptSpec: generated,
        tags: generated.tags,
        riskNotes: generated.riskNotes.join("\n"),
        modelName: "deepseek",
        promptVersion: "content-douyin-v1",
      },
    });
    await reportProgress(85, "执行发布前评分");
    const scoring = await scoreContentProject(payload.userId, content.id);
    await appendArtifactMessage({
      userId: payload.userId,
      conversationId: input.conversationId ?? content.conversationId,
      jobId: payload.databaseJobId,
      contentId: content.id,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      platform: "douyin",
      contentKind: "douyin_video_script",
      title: generated.title,
      preview: generated.caption.slice(0, 200),
      score: scoring.score.total,
    });
    return {
      resultType: "contentRevision",
      resultId: revision.id,
      output: { contentId: content.id, score: scoring.score.total },
    };
  } catch (error) {
    if (isAppError(error) && error.code === "AI_GENERATION_FAILED" && error.statusCode === 422) {
      return {
        finalStatus: "waiting_input",
        output: { reason: "STRUCTURED_OUTPUT_INVALID", message: error.message },
      };
    }
    throw error;
  }
};

/** 生成成功后把 ArtifactCard 写回会话;按 jobId 幂等,Worker 重试不重复发消息。 */
async function appendArtifactMessage(params: {
  userId: string;
  conversationId: string | null;
  jobId: string;
  contentId: string;
  revisionId: string;
  revisionNumber: number;
  platform: "xiaohongshu" | "douyin";
  contentKind: "xhs_graphic" | "douyin_video_script";
  title: string;
  preview: string;
  score: number;
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
        title: params.title,
        preview: params.preview,
        score: params.score,
        actions: [
          { actionId: "artifact.open", label: "打开编辑", appearance: "primary", repeatable: true },
          { actionId: "artifact.refine", label: "继续优化", repeatable: true },
          { actionId: "publish.prepare", label: "准备发布", repeatable: true },
        ],
      },
    ],
  });
  try {
    await prisma.message.create({
      data: {
        conversationId: params.conversationId,
        role: "assistant",
        content: `原创稿已生成:「${params.title}」(v${params.revisionNumber},评分 ${params.score}/100)。`,
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

registerJobHandler("content.generate", contentGenerationHandler);
