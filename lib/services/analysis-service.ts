import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { getAccountsWithNotes } from "@/lib/services/benchmark-service";
import { getEffectivePersona } from "@/lib/services/persona-service";
import { PROMPT_VERSION } from "@/lib/constants/prompt-version";
import type { AnalysisType, Prisma } from "@prisma/client";

function topNoteTitles(
  accounts: Awaited<ReturnType<typeof getAccountsWithNotes>>
): string[] {
  return accounts.flatMap((account) =>
    account.notes.slice(0, 3).map((note) => note.title).filter(Boolean) as string[]
  );
}

function inferTopicIdeas(accounts: Awaited<ReturnType<typeof getAccountsWithNotes>>) {
  const tags = accounts.flatMap((account) => account.notes.flatMap((note) => note.tags));
  const unique = Array.from(new Set(tags.filter(Boolean))).slice(0, 8);
  return unique.length ? unique : accounts.map((account) => account.category).filter(Boolean);
}

function buildLocalReport(params: {
  accounts: Awaited<ReturnType<typeof getAccountsWithNotes>>;
  persona: Awaited<ReturnType<typeof getEffectivePersona>>;
  type: AnalysisType;
}) {
  const names = params.accounts
    .map((account) => account.nickname ?? account.xhsId ?? "Unnamed account")
    .join(", ");
  const titles = topNoteTitles(params.accounts);
  const topics = inferTopicIdeas(params.accounts);
  const personaLine = params.persona?.niche
    ? `Persona fit: apply these patterns to ${params.persona.niche}.`
    : "Persona fit: add a creator persona to make adaptation sharper.";

  return [
    `# Benchmark analysis: ${names}`,
    "",
    "## Positioning",
    "The strongest accounts use a narrow, repeatable promise and make the reader feel the result is achievable.",
    "",
    "## Content patterns",
    ...topics.map((topic) => `- Turn ${topic} into repeatable series posts with one concrete takeaway per note.`),
    "",
    "## Title patterns",
    ...(titles.length
      ? titles.map((title) => `- ${title}`)
      : ["- Use before/after, checklist, and personal learning hooks."]),
    "",
    "## What to learn",
    "- Keep the hook specific.",
    "- Use short sections and practical examples.",
    "- Save one clear action for the ending.",
    "",
    "## What to avoid",
    "- Do not copy account wording or personal stories.",
    "- Do not borrow unverifiable results.",
    "",
    "## Adaptation",
    personaLine,
  ].join("\n");
}

export async function analyzeAccounts(params: {
  userId: string;
  accountIds: string[];
  personaId?: string | null;
  analysisType?: AnalysisType;
}): Promise<{
  analysisId: string;
  report: string;
  analysisType: AnalysisType;
}> {
  const accounts = await getAccountsWithNotes(params.userId, params.accountIds);
  if (!accounts.length) {
    throw new AppError("NOT_FOUND", "No benchmark accounts found for analysis.", 404);
  }

  const persona = await getEffectivePersona(params.userId, params.personaId);
  const type: AnalysisType =
    params.analysisType ?? (accounts.length > 1 ? "fusion" : "single_account");
  const topics = inferTopicIdeas(accounts);
  const report = buildLocalReport({ accounts, persona, type });

  const saved = await prisma.benchmarkAnalysis.create({
    data: {
      userId: params.userId,
      accountId: type === "single_account" ? accounts[0]?.id : null,
      analysisType: type,
      positioning: "Narrow promise, practical examples, and repeatable post structure.",
      targetAudience: persona?.targetAudience ?? "Readers seeking practical creator advice.",
      frequentTopics: topics as Prisma.InputJsonValue,
      titlePatterns: topNoteTitles(accounts) as Prisma.InputJsonValue,
      contentStructure: "Hook -> personal context -> checklist -> action.",
      languageStyle: "Direct, concrete, low-jargon.",
      interactionStyle: "Ask readers to save, comment with their situation, or pick a next topic.",
      personaExpression: persona?.creatorIdentity ?? null,
      learnablePoints: [
        "Specific opening hook",
        "Series-friendly topic framing",
        "Simple ending action",
      ] as Prisma.InputJsonValue,
      avoidPoints: ["Copying stories", "Unsupported claims"] as Prisma.InputJsonValue,
      userAdaptation: persona?.niche
        ? `Adapt these patterns to ${persona.niche}.`
        : "Create a persona profile before final publishing.",
      fullReport: report,
      modelName: env.DEEPSEEK_MODEL,
      promptVersion: PROMPT_VERSION.ACCOUNT_ANALYSIS,
    },
  });

  return { analysisId: saved.id, report, analysisType: type };
}

export async function listAnalyses(userId: string) {
  return prisma.benchmarkAnalysis.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      analysisType: true,
      accountId: true,
      createdAt: true,
    },
  });
}
