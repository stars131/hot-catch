import { prisma } from "@/lib/prisma";
import { AppError, isAppError } from "@/lib/errors";
import { truncate } from "@/lib/utils";
import { getAccountsWithNotes } from "@/lib/services/benchmark-service";
import { getEffectivePersona } from "@/lib/services/persona-service";
import {
  buildContentGenerationPrompt,
  contentGenerationResultSchema,
  type ContentGenerationResult,
} from "@/lib/ai/prompts/content-generation";
import {
  buildContentOptimizationPrompt,
  type OptimizeTarget,
} from "@/lib/ai/prompts/content-optimization";
import { PROMPT_VERSION } from "@/lib/constants/prompt-version";
import { createLlmProvider } from "@/lib/providers/factory";
import {
  resolveConversationSkills,
  skillSnapshotsJson,
} from "@/lib/services/skill-service";
import type { ContentStatus } from "@prisma/client";

function buildMarkdownFromStructured(result: ContentGenerationResult): string {
  const parts: string[] = [];
  if (result.titles?.length) {
    parts.push(`## Title options\n${result.titles.map((title) => `- ${title}`).join("\n")}`);
  }
  if (result.coverTexts?.length) {
    parts.push(
      `## Cover text\n${result.coverTexts.map((text) => `- ${text}`).join("\n")}`
    );
  }
  if (result.pages?.length) {
    parts.push(
      `## Page structure\n${result.pages
        .map((page) => `**Page ${page.page}**: ${page.text}`)
        .join("\n\n")}`
    );
  }
  if (result.body) parts.push(`## Body\n${result.body}`);
  if (result.tags?.length) parts.push(`## Tags\n${result.tags.join(" ")}`);
  if (result.interactionEnding) {
    parts.push(`## Interaction ending\n${result.interactionEnding}`);
  }
  if (result.benchmarkExplanation) {
    parts.push(`## Benchmark logic\n${result.benchmarkExplanation}`);
  }
  if (result.riskNotes) parts.push(`## Risk notes\n${result.riskNotes}`);
  if (result.optimizeDirections) {
    parts.push(`## Next optimization\n${result.optimizeDirections}`);
  }
  return parts.join("\n\n");
}

export async function generateContent(params: {
  userId: string;
  inputType: "topic" | "idea" | "draft";
  inputText: string;
  personaId?: string | null;
  benchmarkAccountIds?: string[];
  outputType?: string;
  conversationId?: string | null;
  skillIds?: string[];
}): Promise<{
  contentId: string;
  markdown: string;
  structured: ContentGenerationResult;
}> {
  const persona = await getEffectivePersona(params.userId, params.personaId);
  const accounts = params.benchmarkAccountIds?.length
    ? await getAccountsWithNotes(params.userId, params.benchmarkAccountIds)
    : [];
  const skillSelection = await resolveConversationSkills({
    userId: params.userId,
    conversationId: params.conversationId,
    skillIds: params.skillIds,
  });

  const provider = await requireConfiguredLlmProvider(params.userId);
  const messages = buildContentGenerationPrompt({
    inputType: params.inputType,
    inputText: params.inputText,
    persona,
    benchmarkAccounts: accounts,
    skillInstruction: skillSelection.promptInstruction,
  });
  const structured: ContentGenerationResult = await provider.generateStructured({
    system: messages.find((message) => message.role === "system")?.content ?? "",
    prompt: messages
      .filter((message) => message.role !== "system")
      .map((message) => message.content)
      .join("\n\n"),
    schema: contentGenerationResultSchema,
  });
  const modelName = `${provider.name}/${provider.model}`;

  const markdown = structured.fullMarkdown?.trim() || buildMarkdownFromStructured(structured);
  const saved = await prisma.generatedContent.create({
    data: {
      userId: params.userId,
      conversationId: params.conversationId ?? undefined,
      personaId: persona?.id ?? undefined,
      title: structured.titles?.[0] ?? truncate(params.inputText, 60),
      inputType: params.inputType,
      inputText: params.inputText,
      selectedAccountIds: params.benchmarkAccountIds ?? [],
      selectedSkillIds: skillSelection.ids,
      skillSnapshots: skillSelection.snapshots.length
        ? skillSnapshotsJson(skillSelection.snapshots)
        : undefined,
      outputType: params.outputType ?? "xhs_graphic",
      generatedTitleOptions: structured.titles ?? [],
      coverTextOptions: structured.coverTexts ?? [],
      pageStructure: structured.pages ?? [],
      bodyText: structured.body,
      tags: structured.tags ?? [],
      interactionEnding: structured.interactionEnding,
      benchmarkExplanation: structured.benchmarkExplanation,
      riskNotes: structured.riskNotes,
      fullMarkdown: markdown,
      status: "draft",
      modelName,
      promptVersion: PROMPT_VERSION.CONTENT_GENERATION,
    },
  });

  return { contentId: saved.id, markdown, structured };
}

export async function optimizeContent(params: {
  userId: string;
  target: OptimizeTarget;
  currentContent: string;
  personaId?: string | null;
}): Promise<string> {
  const persona = await getEffectivePersona(params.userId, params.personaId);
  const provider = await requireConfiguredLlmProvider(params.userId);
  const messages = buildContentOptimizationPrompt({
    target: params.target,
    currentContent: params.currentContent,
    persona,
  });
  return provider.generateText({
    system: messages.find((message) => message.role === "system")?.content ?? "",
    prompt: messages
      .filter((message) => message.role !== "system")
      .map((message) => message.content)
      .join("\n\n"),
  });
}

async function requireConfiguredLlmProvider(userId: string) {
  try {
    return await createLlmProvider(userId);
  } catch (error) {
    if (!isMissingModelConfiguration(error)) throw error;
    throw new AppError(
      "AI_NOT_CONFIGURED",
      "未配置可用的默认生成模型，请先前往“连接设置”保存模型凭证并设为默认模型。",
      422,
    );
  }
}

function isMissingModelConfiguration(error: unknown) {
  return (
    isAppError(error) &&
    (error.code === "CREDENTIAL_NOT_CONFIGURED" ||
      error.code === "AI_NOT_CONFIGURED")
  );
}

export async function saveGeneratedContent(
  userId: string,
  params: {
    contentId?: string;
    conversationId?: string | null;
    personaId?: string | null;
    title?: string | null;
    inputText?: string | null;
    fullMarkdown?: string | null;
    status?: ContentStatus;
  }
) {
  const status = params.status ?? "saved";
  if (params.contentId) {
    const existing = await prisma.generatedContent.findFirst({
      where: { id: params.contentId, userId },
    });
    if (existing) {
      return prisma.generatedContent.update({
        where: { id: params.contentId },
        data: {
          status,
          title: params.title ?? existing.title,
          fullMarkdown: params.fullMarkdown ?? existing.fullMarkdown,
        },
      });
    }
  }

  return prisma.generatedContent.create({
    data: {
      userId,
      conversationId: params.conversationId ?? undefined,
      personaId: params.personaId ?? undefined,
      title: params.title ?? truncate(params.inputText ?? "Untitled content", 60),
      inputText: params.inputText,
      inputType: "topic",
      selectedAccountIds: [],
      outputType: "xhs_graphic",
      fullMarkdown: params.fullMarkdown,
      status,
      tags: [],
    },
  });
}

export async function listContents(userId: string) {
  return prisma.generatedContent.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      outputType: true,
      platform: true,
      contentKind: true,
      scoreSnapshot: true,
      _count: { select: { revisions: true, publishRecords: true } },
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getContent(userId: string, id: string) {
  return prisma.generatedContent.findFirst({ where: { id, userId } });
}
