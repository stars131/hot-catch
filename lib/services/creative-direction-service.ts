import { createHash } from "node:crypto";
import { CreativeDirectionStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { createLlmProvider } from "@/lib/providers/factory";
import {
  BUILTIN_DIRECTION_MANIFESTS,
  DIRECTION_MANIFEST_PROTOCOL,
  buildDirectionRouterSystem,
  directionManifestSchema,
  directionRefSchema,
  directionSelectionSchema,
  directionSnapshotSchema,
  type DirectionManifest,
  type DirectionRef,
  type DirectionSelection,
  type DirectionSnapshot,
} from "@/lib/creator/creative-direction";
import type { PlatformId, UiLocale } from "@/lib/platforms/registry";
import { getEffectivePersona } from "@/lib/services/persona-service";

const ROUTER_PROMPT_VERSION = "creative-direction-router/v1";

const missingInputSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,40}$/),
  label: z.string().trim().min(1).max(80),
  reason: z.string().trim().min(1).max(300),
  required: z.boolean(),
  inputType: z.enum(["text", "choice"]),
  options: z.array(z.string().trim().min(1).max(80)).max(6).optional(),
}).strict();

const modelRecommendationSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
  confidence: z.number().min(0).max(1),
  rationale: z.string().trim().min(1).max(800),
  fitSignals: z.array(z.string().trim().min(1).max(160)).min(1).max(6),
  risks: z.array(z.string().trim().min(1).max(200)).max(5),
  outlinePreview: z.array(z.string().trim().min(1).max(120)).min(2).max(6),
  suggestedSecondaryKey: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/).nullable(),
}).strict();

const novelCandidateSchema = z.object({
  label: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(10).max(240),
  primaryInstruction: z.string().trim().min(30).max(1000),
  secondaryInstruction: z.string().trim().min(20).max(500),
  outline: z.array(z.string().trim().min(1).max(100)).min(2).max(8),
  evidencePolicy: z.string().trim().min(20).max(600),
  reviewCriteria: z.array(z.object({
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().min(10).max(300),
  }).strict()).min(2).max(5),
}).strict();

const routerOutputSchema = z.object({
  intentSummary: z.string().trim().min(1).max(500),
  needsInput: z.boolean(),
  missingInputs: z.array(missingInputSchema).max(3),
  recommendations: z.array(modelRecommendationSchema).max(3),
  novelCandidate: novelCandidateSchema.nullable(),
}).strict();

export type DirectionMissingInput = z.infer<typeof missingInputSchema>;

export type DirectionRecommendation = {
  id: string;
  ref: DirectionRef;
  label: string;
  summary: string;
  category: string;
  confidence?: number;
  rationale: string;
  fitSignals: string[];
  risks: string[];
  outlinePreview: string[];
  suggestedSecondary?: DirectionRef;
};

export type DirectionAnalysis = {
  source: "model" | "rules";
  intentSummary: string;
  needsInput: boolean;
  missingInputs: DirectionMissingInput[];
  recommendations: DirectionRecommendation[];
};

export async function ensureDirectionCatalog() {
  await prisma.creativeDirectionDefinition.createMany({
    data: BUILTIN_DIRECTION_MANIFESTS.map((manifest) => ({
      id: `direction-${manifest.key}-v${manifest.version}`,
      key: manifest.key,
      version: manifest.version,
      status: CreativeDirectionStatus.active,
      category: manifest.category,
      zhLabel: manifest.labels.zhCN,
      enLabel: manifest.labels.enUS,
      aliases: manifest.aliases,
      manifest: manifest as unknown as Prisma.InputJsonValue,
      activatedAt: new Date("2026-07-17T00:00:00.000Z"),
    })),
    skipDuplicates: true,
  });
}

export async function listCreativeDirections(input: {
  q?: string;
  category?: string;
  platform?: PlatformId;
  locale?: UiLocale;
  limit?: number;
}) {
  await ensureDirectionCatalog();
  const rows = await prisma.creativeDirectionDefinition.findMany({
    where: {
      status: CreativeDirectionStatus.active,
      ...(input.category ? { category: input.category } : {}),
    },
    orderBy: [{ category: "asc" }, { key: "asc" }, { version: "desc" }],
  });
  const latest = latestRows(rows)
    .map((row) => ({ row, manifest: directionManifestSchema.safeParse(row.manifest) }))
    .filter((item): item is typeof item & { manifest: { success: true; data: DirectionManifest } } => item.manifest.success)
    .filter(({ manifest }) => !input.platform || manifest.data.compatibility.platforms.includes(input.platform))
    .filter(({ row, manifest }) => matchesQuery(row, manifest.data, input.q))
    .slice(0, Math.min(input.limit ?? 80, 100));
  return latest.map(({ row, manifest }) => summarize(row.id, manifest.data, input.locale ?? "zh-CN"));
}

export async function recommendCreativeDirections(input: {
  userId: string;
  conversationId: string;
  sourceMessageId?: string;
  brief: string;
  platform?: PlatformId;
  uiLocale: UiLocale;
  supplementalAnswers?: Record<string, string>;
}) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, userId: input.userId },
    include: { contextVersions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!conversation) throw new AppError("NOT_FOUND", "会话不存在。", 404);
  const globalPersona = await getEffectivePersona(input.userId);
  await ensureDirectionCatalog();
  const rows = latestRows(await prisma.creativeDirectionDefinition.findMany({
    where: { status: CreativeDirectionStatus.active },
    orderBy: [{ key: "asc" }, { version: "desc" }],
  }));
  const catalog = rows.flatMap((row) => {
    const parsed = directionManifestSchema.safeParse(row.manifest);
    return parsed.success ? [{ row, manifest: parsed.data }] : [];
  });
  const fingerprint = catalogFingerprint(catalog.map((item) => item.manifest));
  const context = conversation.contextVersions[0];
  const contextPersona = context?.personaSnapshot;
  const analysisContext = {
    platform: input.platform ?? conversation.targetPlatforms[0] ?? "xiaohongshu",
    persona: hasJsonContent(contextPersona) ? contextPersona : globalPersona,
    memories: context?.memorySnapshot ?? null,
    answers: input.supplementalAnswers ?? {},
  };
  const inputHash = hashJson({
    brief: input.brief.trim(),
    context: analysisContext,
    catalog: fingerprint,
    promptVersion: ROUTER_PROMPT_VERSION,
  });
  const replay = await prisma.creativeDirectionDecision.findUnique({
    where: { conversationId_inputHash: { conversationId: input.conversationId, inputHash } },
  });
  if (replay) return decisionResult(replay);

  const shortlist = shortlistCatalog(catalog, input.brief, analysisContext.platform as PlatformId);
  let analysis: DirectionAnalysis;
  let modelProvider: string | null = null;
  let modelName: string | null = null;
  let novelManifest: DirectionManifest | null = null;
  try {
    const provider = await createLlmProvider(input.userId);
    modelProvider = provider.name;
    modelName = provider.model;
    const output = await provider.generateStructured({
      system: buildDirectionRouterSystem(input.uiLocale),
      prompt: JSON.stringify({
        brief: input.brief,
        platform: analysisContext.platform,
        personaAndMemory: truncateJson({ persona: analysisContext.persona, memories: analysisContext.memories }, 6000),
        supplementalAnswers: analysisContext.answers,
        availableDirections: shortlist.map(({ manifest }) => ({
          key: manifest.key,
          label: input.uiLocale === "en-US" ? manifest.labels.enUS : manifest.labels.zhCN,
          category: manifest.category,
          summary: input.uiLocale === "en-US" ? manifest.summary.enUS : manifest.summary.zhCN,
          signals: manifest.routing.signals,
          outline: manifest.generation.outline,
        })),
      }),
      schema: routerOutputSchema,
      temperature: 0.25,
    });
    const validated = normalizeModelAnalysis(output, shortlist, input.uiLocale);
    analysis = validated.analysis;
    novelManifest = validated.novelManifest;
  } catch {
    analysis = fallbackAnalysis(shortlist, input.brief, input.uiLocale);
  }

  let decision;
  try {
    decision = await prisma.creativeDirectionDecision.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        sourceMessageId: input.sourceMessageId,
        inputHash,
        catalogFingerprint: fingerprint,
        analysis: analysis as unknown as Prisma.InputJsonValue,
        modelProvider,
        modelName,
        promptVersion: ROUTER_PROMPT_VERSION,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.creativeDirectionDecision.findUnique({
        where: { conversationId_inputHash: { conversationId: input.conversationId, inputHash } },
      });
      if (raced) return decisionResult(raced);
    }
    throw error;
  }

  if (novelManifest) {
    const fingerprintValue = hashJson(novelManifest);
    const candidate = await prisma.creativeDirectionCandidate.create({
      data: {
        userId: input.userId,
        conversationId: input.conversationId,
        decisionId: decision.id,
        fingerprint: fingerprintValue,
        manifest: novelManifest as unknown as Prisma.InputJsonValue,
      },
    });
    const temporaryRecommendation = recommendationFromManifest(novelManifest, input.uiLocale, {
        source: "temporary",
        candidateId: candidate.id,
        rationale: input.uiLocale === "en-US"
          ? "No catalog direction fully matched, so the model proposed a controlled temporary direction."
          : "现有目录没有完全匹配项，大模型提出了一个仅用于本次创作的受控临时候选。",
      });
    const weakestConfidence = analysis.recommendations.at(-1)?.confidence ?? 0;
    if (analysis.recommendations.length < 3 || weakestConfidence < 0.55) {
      analysis.recommendations = [
        ...analysis.recommendations.slice(0, 2),
        temporaryRecommendation,
      ].slice(0, 3);
      decision = await prisma.creativeDirectionDecision.update({
        where: { id: decision.id },
        data: { analysis: analysis as unknown as Prisma.InputJsonValue },
      });
    }
  }

  return { decisionId: decision.id, analysis };
}

export async function confirmCreativeDirectionDecision(input: {
  userId: string;
  conversationId: string;
  decisionId: string;
  primary: DirectionRef;
  secondary?: DirectionRef;
}) {
  const decision = await prisma.creativeDirectionDecision.findFirst({
    where: { id: input.decisionId, userId: input.userId, conversationId: input.conversationId },
  });
  if (!decision) throw new AppError("NOT_FOUND", "方向推荐记录不存在。", 404);
  const selection = directionSelectionSchema.parse({
    decisionId: decision.id,
    primary: input.primary,
    ...(input.secondary ? { secondary: input.secondary } : {}),
  });
  const snapshot = await resolveDirectionSelectionSnapshot({
    userId: input.userId,
    conversationId: input.conversationId,
    selection,
    analysis: parseAnalysis(decision.analysis),
  });
  await prisma.$transaction([
    prisma.creativeDirectionDecision.updateMany({
      where: {
        conversationId: input.conversationId,
        userId: input.userId,
        status: "confirmed",
        id: { not: decision.id },
      },
      data: { status: "superseded" },
    }),
    prisma.creativeDirectionDecision.update({
      where: { id: decision.id },
      data: {
        status: "confirmed",
        selectedPrimary: snapshot.primary as unknown as Prisma.InputJsonValue,
        selectedSecondary: snapshot.secondary
          ? snapshot.secondary as unknown as Prisma.InputJsonValue
          : Prisma.JsonNull,
        confirmedAt: new Date(),
      },
    }),
  ]);
  return { selection, snapshot };
}

/** Return the conversation's active confirmed direction as an immutable selection/snapshot pair. */
export async function getLatestConfirmedCreativeDirection(input: {
  userId: string;
  conversationId: string;
}): Promise<{ selection: DirectionSelection; snapshot: DirectionSnapshot } | null> {
  const decision = await prisma.creativeDirectionDecision.findFirst({
    where: {
      userId: input.userId,
      conversationId: input.conversationId,
      status: "confirmed",
    },
    orderBy: [{ confirmedAt: "desc" }, { updatedAt: "desc" }],
  });
  if (!decision?.selectedPrimary) return null;

  const analysis = parseAnalysis(decision.analysis);
  const primaryManifest = directionManifestSchema.parse(decision.selectedPrimary);
  const secondaryManifest = decision.selectedSecondary
    ? directionManifestSchema.parse(decision.selectedSecondary)
    : undefined;
  const referenceFor = (manifest: DirectionManifest): DirectionRef =>
    analysis.recommendations.find((item) =>
      item.ref.key === manifest.key && item.ref.version === manifest.version
    )?.ref ?? {
      key: manifest.key,
      version: manifest.version,
      source: "catalog",
    };
  const selection = directionSelectionSchema.parse({
    decisionId: decision.id,
    primary: referenceFor(primaryManifest),
    ...(secondaryManifest ? { secondary: referenceFor(secondaryManifest) } : {}),
  });
  const snapshot = await resolveDirectionSelectionSnapshot({
    userId: input.userId,
    conversationId: input.conversationId,
    selection,
    analysis,
  });
  return { selection, snapshot };
}

export async function resolveDirectionSelectionSnapshot(input: {
  userId: string;
  conversationId: string;
  selection: DirectionSelection;
  analysis?: DirectionAnalysis;
}): Promise<DirectionSnapshot> {
  const selection = directionSelectionSchema.parse(input.selection);
  if (selection.decisionId) {
    const confirmed = await prisma.creativeDirectionDecision.findFirst({
      where: {
        id: selection.decisionId,
        userId: input.userId,
        conversationId: input.conversationId,
        status: "confirmed",
      },
    });
    if (confirmed?.selectedPrimary) {
      const primary = directionManifestSchema.parse(confirmed.selectedPrimary);
      const secondary = confirmed.selectedSecondary
        ? directionManifestSchema.parse(confirmed.selectedSecondary)
        : undefined;
      if (
        primary.key !== selection.primary.key ||
        primary.version !== selection.primary.version ||
        Boolean(secondary) !== Boolean(selection.secondary) ||
        (secondary && selection.secondary && (
          secondary.key !== selection.secondary.key ||
          secondary.version !== selection.secondary.version
        ))
      ) {
        throw new AppError("VALIDATION_ERROR", "方向选择与已确认快照不一致。", 422);
      }
      const analysis = parseAnalysis(confirmed.analysis);
      const recommendation = analysis.recommendations.find((item) => item.ref.key === primary.key);
      return directionSnapshotSchema.parse({
        decisionId: confirmed.id,
        primary,
        ...(secondary ? { secondary } : {}),
        ...(recommendation ? {
          recommendation: {
            ...(recommendation.confidence === undefined ? {} : { confidence: recommendation.confidence }),
            rationale: recommendation.rationale,
            risks: recommendation.risks,
          },
        } : {}),
        capturedAt: (confirmed.confirmedAt ?? confirmed.updatedAt).toISOString(),
      });
    }
  }
  const primary = await resolveDirectionRef(input.userId, input.conversationId, selection.primary);
  const secondary = selection.secondary
    ? await resolveDirectionRef(input.userId, input.conversationId, selection.secondary)
    : undefined;
  if (secondary) {
    if (primary.key === secondary.key) {
      throw new AppError("VALIDATION_ERROR", "主方向和辅方向不能相同。", 422);
    }
    if (primary.conflicts.includes(secondary.key) || secondary.conflicts.includes(primary.key)) {
      throw new AppError("VALIDATION_ERROR", "所选主方向和辅方向存在冲突。", 422);
    }
    if (secondary.compatibility.role === "primary") {
      throw new AppError("VALIDATION_ERROR", "该方向不能作为辅方向。", 422);
    }
  }
  const recommendation = input.analysis?.recommendations.find((item) => item.ref.key === primary.key);
  return directionSnapshotSchema.parse({
    ...(selection.decisionId ? { decisionId: selection.decisionId } : {}),
    primary,
    ...(secondary ? { secondary } : {}),
    ...(recommendation ? {
      recommendation: {
        ...(recommendation.confidence === undefined ? {} : { confidence: recommendation.confidence }),
        rationale: recommendation.rationale,
        risks: recommendation.risks,
      },
    } : {}),
    capturedAt: new Date().toISOString(),
  });
}

export function parseDirectionSnapshot(value: unknown): DirectionSnapshot | null {
  const parsed = directionSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

async function resolveDirectionRef(userId: string, conversationId: string, refValue: DirectionRef) {
  const ref = directionRefSchema.parse(refValue);
  if (ref.source === "catalog") {
    const row = await prisma.creativeDirectionDefinition.findUnique({
      where: { key_version: { key: ref.key, version: ref.version } },
    });
    if (!row || row.status !== "active") {
      throw new AppError("VALIDATION_ERROR", "所选方向版本已不可用，请重新选择。", 422);
    }
    return directionManifestSchema.parse(row.manifest);
  }
  if (!ref.candidateId) throw new AppError("VALIDATION_ERROR", "临时方向缺少候选标识。", 422);
  const candidate = await prisma.creativeDirectionCandidate.findFirst({
    where: { id: ref.candidateId, userId, conversationId, status: { in: ["pending", "approved"] } },
  });
  if (!candidate) throw new AppError("FORBIDDEN", "临时方向不存在或不属于当前账号。", 403);
  return directionManifestSchema.parse(candidate.manifest);
}

function normalizeModelAnalysis(
  output: z.infer<typeof routerOutputSchema>,
  shortlist: Array<{ row: { id: string }; manifest: DirectionManifest }>,
  locale: UiLocale,
) {
  const byKey = new Map(shortlist.map((item) => [item.manifest.key, item.manifest]));
  const recommendations = output.recommendations.flatMap((item) => {
    const manifest = byKey.get(item.key);
    if (!manifest) return [];
    const secondary = item.suggestedSecondaryKey
      ? byKey.get(item.suggestedSecondaryKey)
      : undefined;
    return [{
      id: recommendationId(manifest.key, manifest.version),
      ref: { key: manifest.key, version: manifest.version, source: "catalog" as const },
      label: locale === "en-US" ? manifest.labels.enUS : manifest.labels.zhCN,
      summary: locale === "en-US" ? manifest.summary.enUS : manifest.summary.zhCN,
      category: manifest.category,
      confidence: item.confidence,
      rationale: item.rationale,
      fitSignals: item.fitSignals,
      risks: item.risks,
      outlinePreview: item.outlinePreview,
      ...(secondary && secondary.key !== manifest.key ? {
        suggestedSecondary: { key: secondary.key, version: secondary.version, source: "catalog" as const },
      } : {}),
    }];
  });
  const filled = fillRecommendations(recommendations, shortlist, locale);
  const visibleKeys = new Set(filled.map((item) => item.ref.key));
  const visibleRecommendations = filled.map((item) => {
    if (!item.suggestedSecondary || visibleKeys.has(item.suggestedSecondary.key)) return item;
    const recommendation = { ...item };
    delete recommendation.suggestedSecondary;
    return recommendation;
  });
  const novelManifest = output.novelCandidate ? manifestFromNovelCandidate(output.novelCandidate) : null;
  return {
    analysis: {
      source: "model" as const,
      intentSummary: output.intentSummary,
      needsInput: output.needsInput && output.missingInputs.some((item) => item.required),
      missingInputs: output.missingInputs,
      recommendations: visibleRecommendations,
    },
    novelManifest,
  };
}

function fallbackAnalysis(
  shortlist: Array<{ row: { id: string }; manifest: DirectionManifest }>,
  brief: string,
  locale: UiLocale,
): DirectionAnalysis {
  return {
    source: "rules",
    intentSummary: locale === "en-US"
      ? "The configured model is unavailable. These options are based on catalog signals."
      : "当前配置的大模型不可用，以下方向仅按目录信号筛选，可手动查看更多方向。",
    needsInput: brief.trim().length < 4,
    missingInputs: brief.trim().length < 4 ? [{
      key: "topic",
      label: locale === "en-US" ? "Topic" : "创作主题",
      reason: locale === "en-US" ? "Add the subject or problem you want to cover." : "请补充希望讨论的对象、问题或素材。",
      required: true,
      inputType: "text",
    }] : [],
    recommendations: shortlist.slice(0, 3).map(({ manifest }) => recommendationFromManifest(manifest, locale, {
      source: "catalog",
      rationale: locale === "en-US" ? "Matched by catalog signals; no model confidence is shown." : "根据主题关键词和平台适配规则筛选；未显示伪造的模型匹配度。",
    })),
  };
}

function fillRecommendations(
  current: DirectionRecommendation[],
  shortlist: Array<{ row: { id: string }; manifest: DirectionManifest }>,
  locale: UiLocale,
) {
  const result = [...current];
  for (const { manifest } of shortlist) {
    if (result.length >= 3) break;
    if (result.some((item) => item.ref.key === manifest.key)) continue;
    result.push(recommendationFromManifest(manifest, locale, {
      source: "catalog",
      rationale: locale === "en-US" ? "Added from the compatible catalog shortlist." : "由兼容方向候选补足。",
    }));
  }
  return result.slice(0, 3);
}

function recommendationFromManifest(
  manifest: DirectionManifest,
  locale: UiLocale,
  input: { source: "catalog" | "temporary"; candidateId?: string; rationale: string },
): DirectionRecommendation {
  return {
    id: recommendationId(manifest.key, manifest.version),
    ref: {
      key: manifest.key,
      version: manifest.version,
      source: input.source,
      ...(input.candidateId ? { candidateId: input.candidateId } : {}),
    },
    label: locale === "en-US" ? manifest.labels.enUS : manifest.labels.zhCN,
    summary: locale === "en-US" ? manifest.summary.enUS : manifest.summary.zhCN,
    category: manifest.category,
    rationale: input.rationale,
    fitSignals: manifest.routing.signals.slice(0, 3),
    risks: [],
    outlinePreview: manifest.generation.outline.slice(0, 4),
  };
}

function manifestFromNovelCandidate(candidate: z.infer<typeof novelCandidateSchema>): DirectionManifest {
  const digest = createHash("sha256").update(JSON.stringify(candidate)).digest("hex").slice(0, 12);
  return directionManifestSchema.parse({
    protocol: DIRECTION_MANIFEST_PROTOCOL,
    key: `candidate-${digest}`,
    version: 1,
    category: "engagement",
    labels: { zhCN: candidate.label, enUS: candidate.label },
    summary: { zhCN: candidate.summary, enUS: candidate.summary },
    aliases: [],
    compatibility: {
      platforms: ["xiaohongshu", "douyin", "youtube", "tiktok", "instagram", "x", "reddit"],
      goals: ["认知", "信任", "收藏", "互动", "转化"],
      role: "both",
    },
    routing: { signals: [candidate.label, candidate.summary.slice(0, 40)], negativeSignals: [] },
    generation: {
      primaryInstruction: candidate.primaryInstruction,
      secondaryInstruction: candidate.secondaryInstruction,
      outline: candidate.outline,
    },
    evidence: { policy: candidate.evidencePolicy, requiresUserEvidence: false },
    review: {
      criteria: candidate.reviewCriteria.map((criterion, index) => ({
        key: `criterion-${index + 1}`,
        label: criterion.label,
        description: criterion.description,
        weight: Math.floor(100 / candidate.reviewCriteria.length),
        severity: index === 0 ? "important" : "advisory",
      })),
      passThreshold: 72,
    },
    conflicts: [],
  });
}

function shortlistCatalog(
  catalog: Array<{ row: { id: string }; manifest: DirectionManifest }>,
  brief: string,
  platform: PlatformId,
) {
  const text = brief.toLowerCase();
  const categoryCounts = new Map<string, number>();
  return catalog
    .filter(({ manifest }) => manifest.compatibility.platforms.includes(platform))
    .map((item) => ({
      ...item,
      score: item.manifest.routing.signals.reduce(
        (sum, signal) => sum + (text.includes(signal.toLowerCase()) ? 5 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score || a.manifest.key.localeCompare(b.manifest.key))
    .filter((item) => {
      const count = categoryCounts.get(item.manifest.category) ?? 0;
      if (count >= 5) return false;
      categoryCounts.set(item.manifest.category, count + 1);
      return true;
    })
    .slice(0, 20);
}

function latestRows<T extends { key: string; version: number }>(rows: T[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.key)) return false;
    seen.add(row.key);
    return true;
  });
}

function matchesQuery(
  row: { key: string; zhLabel: string; enLabel: string; aliases: string[] },
  manifest: DirectionManifest,
  q?: string,
) {
  if (!q?.trim()) return true;
  const needle = q.trim().toLowerCase();
  return [row.key, row.zhLabel, row.enLabel, ...row.aliases, ...manifest.routing.signals]
    .some((value) => value.toLowerCase().includes(needle));
}

function summarize(id: string, manifest: DirectionManifest, locale: UiLocale) {
  return {
    id,
    ref: { key: manifest.key, version: manifest.version, source: "catalog" as const },
    key: manifest.key,
    version: manifest.version,
    category: manifest.category,
    label: locale === "en-US" ? manifest.labels.enUS : manifest.labels.zhCN,
    summary: locale === "en-US" ? manifest.summary.enUS : manifest.summary.zhCN,
    role: manifest.compatibility.role,
    outline: manifest.generation.outline,
  };
}

function decisionResult(decision: { id: string; analysis: Prisma.JsonValue }) {
  return { decisionId: decision.id, analysis: parseAnalysis(decision.analysis) };
}

function parseAnalysis(value: unknown): DirectionAnalysis {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as DirectionAnalysis
    : null;
  if (!record || !Array.isArray(record.recommendations)) {
    throw new AppError("DATABASE_ERROR", "方向推荐记录无法读取。", 500);
  }
  return record;
}

function recommendationId(key: string, version: number) {
  return `dir-${key}-v${version}`;
}

function catalogFingerprint(manifests: DirectionManifest[]) {
  return hashJson(manifests.map((manifest) => [manifest.key, manifest.version, manifest.review]));
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function truncateJson(value: unknown, max: number) {
  const serialized = JSON.stringify(value);
  return serialized.length <= max ? value : serialized.slice(0, max);
}

function hasJsonContent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value as Record<string, unknown>).length > 0;
}
