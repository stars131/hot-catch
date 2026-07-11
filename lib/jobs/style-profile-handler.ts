import { Prisma } from "@prisma/client";
import { z } from "zod";
import { isAppError } from "@/lib/errors";
import { registerJobHandler } from "@/lib/jobs/handlers";
import type { JobHandler } from "@/lib/jobs/types";
import { prisma } from "@/lib/prisma";
import { createLlmProvider } from "@/lib/providers/factory";
import {
  buildStyleProfileSchema,
  styleAnalysisOutputSchema,
} from "@/lib/validators/style-profile";

const handlerInputSchema = buildStyleProfileSchema.extend({});

const styleProfileBuildHandler: JobHandler = async (payload, reportProgress) => {
  const input = handlerInputSchema.parse(payload.input);
  await reportProgress(10, "读取证据作品");
  const notes = await prisma.benchmarkNote.findMany({
    where: {
      id: { in: input.noteIds },
      account: { userId: payload.userId, platform: input.platform },
    },
    include: { account: { select: { platform: true } } },
  });
  if (notes.length !== new Set(input.noteIds).size) {
    throw new Error("部分作品不存在、平台不一致或不属于当前用户。");
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

  await reportProgress(30, "归纳风格特征");
  let analysis: z.infer<typeof styleAnalysisOutputSchema>;
  try {
    analysis = await provider.generateStructured({
      system:
        "你是内容风格研究员。只从提供的公开或授权作品中归纳可验证的表达规律，不模仿身份，不推断隐私。每个主要结论必须引用 noteId 证据，输出 JSON。",
      prompt: `平台：${input.platform}\n画像名称：${input.name}\n作品：\n${JSON.stringify(
        notes.map((note) => ({
          noteId: note.id,
          title: note.title,
          text: (note.transcript || note.content || "").slice(0, 3000),
          contentType: note.contentType,
          analysis: note.analysis,
        })),
      )}\n\n归纳主题、开场、节奏、语气、视觉语言、内容边界、整体置信度和逐条证据。`,
      schema: styleAnalysisOutputSchema,
      temperature: 0.3,
    });
  } catch (error) {
    if (isAppError(error) && error.code === "AI_GENERATION_FAILED" && error.statusCode === 422) {
      return {
        finalStatus: "waiting_input",
        output: { reason: "STRUCTURED_OUTPUT_INVALID", message: error.message },
      };
    }
    throw error;
  }

  const selectedNoteIds = new Set(notes.map((note) => note.id));
  const validEvidence = analysis.evidence.filter((item) => selectedNoteIds.has(item.noteId));
  if (validEvidence.length < 3) {
    return {
      finalStatus: "waiting_input",
      output: { reason: "INSUFFICIENT_EVIDENCE", message: "可追溯证据少于 3 条，需要人工补充。" },
    };
  }

  await reportProgress(80, "保存待审核画像");
  const profile = await prisma.$transaction(async (tx) => {
    const created = await tx.creatorStyleProfile.create({
      data: {
        userId: payload.userId,
        platform: input.platform,
        name: input.name,
        status: "in_review",
        summary: analysis.summary,
        themes: toJson(analysis.themes),
        hooks: toJson(analysis.hooks),
        pacing: toJson(analysis.pacing),
        tone: toJson(analysis.tone),
        visualLanguage: toJson(analysis.visualLanguage),
        boundaries: toJson(analysis.boundaries),
        confidence: analysis.confidence,
      },
    });
    await tx.styleEvidence.createMany({
      data: validEvidence.map((evidence) => ({
        userId: payload.userId,
        styleProfileId: created.id,
        benchmarkNoteId: evidence.noteId,
        platformContentId:
          notes.find((note) => note.id === evidence.noteId)?.platformContentId ?? undefined,
        sourceUrl: notes.find((note) => note.id === evidence.noteId)?.noteUrl ?? undefined,
        excerpt: evidence.excerpt,
        insight: evidence.insight,
        dimension: evidence.dimension,
        confidence: evidence.confidence,
      })),
    });
    return created;
  });
  return { resultType: "creatorStyleProfile", resultId: profile.id };
};

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

registerJobHandler("style-profile.build", styleProfileBuildHandler);
