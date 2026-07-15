import { prisma } from "@/lib/prisma";
import { isAppError } from "@/lib/errors";
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

function buildLocalContent(params: {
  inputText: string;
  persona: Awaited<ReturnType<typeof getEffectivePersona>>;
  benchmarkAccounts: Awaited<ReturnType<typeof getAccountsWithNotes>>;
}): ContentGenerationResult {
  const accountNames = params.benchmarkAccounts
    .map((account) => account.nickname ?? account.xhsId)
    .filter(Boolean)
    .join(", ");
  const personaNiche = params.persona?.niche ?? "your niche";
  const topic = params.inputText;

  const result: ContentGenerationResult = {
    titles: [
      `${topic}: the practical version`,
      `I tested a simpler way to handle ${topic}`,
      `Before you overthink ${topic}, try this checklist`,
    ],
    coverTexts: ["Keep it simple", "A usable checklist", "Save this before you start"],
    pages: [
      { page: 1, text: `Start with one clear promise: make ${topic} easier today.` },
      { page: 2, text: "Show the old problem in one concrete scene." },
      { page: 3, text: "Give a 3-step method readers can copy." },
      { page: 4, text: "Add one example from your real workflow." },
      { page: 5, text: "End with a small action and ask for their situation." },
    ],
    body: `I used to make ${topic} too complicated. The useful shift was to keep one clear goal, one example, and one next step. If you are building ${personaNiche}, do not copy another creator's life. Copy the structure: hook fast, show the situation, give the checklist, and make the ending easy to reply to.`,
    tags: ["#xiaohongshu", "#contentstrategy", "#creatornotes"],
    interactionEnding: "Which part should I turn into a template next?",
    benchmarkExplanation: accountNames
      ? `Inspired by the structure and topic discipline observed in ${accountNames}.`
      : "No benchmark account selected yet; this is a general draft.",
    riskNotes: "Replace generic examples with your real experience before publishing.",
    optimizeDirections: "Add a sharper persona, one personal story, and final cover wording.",
  };
  return { ...result, fullMarkdown: buildMarkdownFromStructured(result) };
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

  let structured: ContentGenerationResult;
  let modelName = "local-template";
  try {
    const provider = await createLlmProvider(params.userId);
    const messages = buildContentGenerationPrompt({
      inputType: params.inputType,
      inputText: params.inputText,
      persona,
      benchmarkAccounts: accounts,
      skillInstruction: skillSelection.promptInstruction,
    });
    structured = await provider.generateStructured({
      system: messages.find((message) => message.role === "system")?.content ?? "",
      prompt: messages
        .filter((message) => message.role !== "system")
        .map((message) => message.content)
        .join("\n\n"),
      schema: contentGenerationResultSchema,
    });
    modelName = `${provider.name}/${provider.model}`;
  } catch (error) {
    if (!isMissingModelConfiguration(error)) throw error;
    structured = buildLocalContent({
      inputText: params.inputText,
      persona,
      benchmarkAccounts: accounts,
    });
  }

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
  try {
    const provider = await createLlmProvider(params.userId);
    const messages = buildContentOptimizationPrompt({
      target: params.target,
      currentContent: params.currentContent,
      persona,
    });
    return await provider.generateText({
      system: messages.find((message) => message.role === "system")?.content ?? "",
      prompt: messages
        .filter((message) => message.role !== "system")
        .map((message) => message.content)
        .join("\n\n"),
    });
  } catch (error) {
    if (!isMissingModelConfiguration(error)) throw error;
  }
  return `${params.currentContent}\n\n## Local optimization note\nMake the hook more specific, replace generic examples with your lived detail, and end with one clear reader action.`;
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
