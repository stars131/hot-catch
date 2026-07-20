import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import {
  getHotspotPayload,
  type HotspotTopic,
} from "@/lib/hotspots/hotspot-service";
import { loadUserHotspotCookieStore } from "@/lib/hotspots/user-cookie-store";
import { enrichHotspotPayloadWithHistory } from "@/lib/hotspots/trend-history-service";
import { prisma } from "@/lib/prisma";
import { createLlmProvider } from "@/lib/providers/factory";

const PROMPT_VERSION = "hotspot-insight/v1";
const CACHE_MS = 6 * 60 * 60 * 1_000;

const analyzeInputSchema = z
  .object({
    topicIds: z.array(z.string().trim().min(1)).min(1).max(12),
  })
  .strict();

const aiOutputSchema = z
  .object({
    insights: z
      .array(
        z
          .object({
            topicKey: z.string().trim().min(1),
            category: z.string().trim().min(1).max(80),
            lifecycle: z.enum(["emerging", "rising", "peaking", "declining"]),
            audience: z.string().trim().min(1).max(240),
            summary: z.string().trim().min(1).max(600),
            recommendation: z.string().trim().min(1).max(800),
            riskLevel: z.enum(["low", "medium", "high"]),
            relevanceScore: z.number().int().min(0).max(100),
            opportunityScore: z.number().int().min(0).max(100),
            saturationScore: z.number().int().min(0).max(100),
            suggestedAngles: z
              .array(z.string().trim().min(1).max(240))
              .min(1)
              .max(5),
            evidence: z
              .array(z.string().trim().min(1).max(320))
              .min(1)
              .max(6),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();

export type AnalyzeHotspotsInput = z.infer<typeof analyzeInputSchema>;

export async function analyzeHotspots(
  userId: string,
  untrustedInput: unknown,
) {
  const input = analyzeInputSchema.parse(untrustedInput);
  const requestedIds = Array.from(new Set(input.topicIds));
  const payload = await enrichHotspotPayloadWithHistory(
    userId,
    await getHotspotPayload({
      limit: 60,
      credentialStore: await loadUserHotspotCookieStore(userId),
    }),
    { record: false },
  );
  const byId = new Map(payload.topics.map((topic) => [topic.id, topic]));
  const topics = requestedIds
    .map((id) => byId.get(id))
    .filter((topic): topic is HotspotTopic => Boolean(topic));
  if (!topics.length) {
    throw new AppError(
      "NOT_FOUND",
      "所选热点已更新，请刷新热点列表后重试。",
      404,
    );
  }

  const provider = await createLlmProvider(userId);
  const prepared = topics.map((topic) => prepareTopic(topic, provider.name, provider.model));
  const now = new Date();
  const cached = await prisma.hotspotAiInsight.findMany({
    where: {
      userId,
      promptVersion: PROMPT_VERSION,
      fingerprint: { in: prepared.map((item) => item.fingerprint) },
      expiresAt: { gt: now },
    },
    orderBy: { updatedAt: "desc" },
  });
  const cachedFingerprints = new Set(cached.map((item) => item.fingerprint));
  const missing = prepared.filter((item) => !cachedFingerprints.has(item.fingerprint));

  if (missing.length) {
    const output = await provider.generateStructured({
      system: [
        "你是内容研究编辑。只根据输入中的真实来源、排名、已观测热度、变化和标题做判断。",
        "不要补充未提供的事实，不要把平台热度当作绝对流量，不要承诺传播结果。",
        "relevanceScore 衡量内容创作者可切入程度；opportunityScore 综合时机、跨平台证据和可差异化程度；saturationScore 衡量同质化风险。",
        "evidence 必须引用输入里可核对的信息，recommendation 必须是可执行建议。只返回符合 Schema 的 JSON。",
      ].join("\n"),
      prompt: JSON.stringify(
        missing.map((item) => item.snapshot),
        null,
        2,
      ),
      schema: aiOutputSchema,
      temperature: 0.25,
    });
    const outputByTopic = new Map(output.insights.map((item) => [item.topicKey, item]));

    await prisma.$transaction(
      missing.flatMap((item) => {
        const insight = outputByTopic.get(item.topic.id);
        if (!insight) return [];
        const data = {
          topicKey: item.topic.id,
          sourceDigest: item.sourceDigest,
          promptVersion: PROMPT_VERSION,
          modelProvider: provider.name,
          modelName: provider.model,
          category: insight.category,
          lifecycle: insight.lifecycle,
          audience: insight.audience,
          summary: insight.summary,
          recommendation: insight.recommendation,
          riskLevel: insight.riskLevel,
          relevanceScore: insight.relevanceScore,
          opportunityScore: insight.opportunityScore,
          saturationScore: insight.saturationScore,
          suggestedAngles: insight.suggestedAngles as Prisma.InputJsonValue,
          evidence: insight.evidence as Prisma.InputJsonValue,
          inputSnapshot: item.snapshot as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + CACHE_MS),
        };
        return [
          prisma.hotspotAiInsight.upsert({
            where: {
              userId_fingerprint_promptVersion: {
                userId,
                fingerprint: item.fingerprint,
                promptVersion: PROMPT_VERSION,
              },
            },
            update: data,
            create: { userId, fingerprint: item.fingerprint, ...data },
          }),
        ];
      }),
    );
  }

  const insights = await prisma.hotspotAiInsight.findMany({
    where: {
      userId,
      promptVersion: PROMPT_VERSION,
      fingerprint: { in: prepared.map((item) => item.fingerprint) },
      expiresAt: { gt: now },
    },
    orderBy: [{ opportunityScore: "desc" }, { updatedAt: "desc" }],
  });
  return {
    generatedAt: new Date().toISOString(),
    requestedCount: requestedIds.length,
    analyzedCount: insights.length,
    missingTopicIds: requestedIds.filter((id) => !byId.has(id)),
    insights,
  };
}

function prepareTopic(topic: HotspotTopic, providerName: string, modelName: string) {
  const snapshot = {
    topicKey: topic.id,
    title: topic.title,
    category: topic.category,
    platform: topic.platform,
    heat: topic.heat,
    change: topic.change,
    status: topic.status,
    trendEvidence: {
      window: topic.trendEvidence.window,
      observationCount: topic.trendEvidence.observationCount,
      firstObservedAt: topic.trendEvidence.firstObservedAt,
      lastObservedHour: topic.trendEvidence.lastObservedAt.slice(0, 13),
      heatChangePercent: topic.trendEvidence.heatChangePercent,
      rankChange: topic.trendEvidence.rankChange,
      observedPeak: topic.trendEvidence.observedPeak,
      isNew: topic.trendEvidence.isNew,
    },
    keywords: topic.keywords,
    riskNotes: topic.riskNotes,
    existingAngles: topic.angles,
    sources: topic.sources.map((source) => ({
      platform: source.platform,
      rank: source.rank,
      score: source.score,
      title: source.title,
      url: source.url,
      description: source.desc,
    })),
  };
  const sourceDigest = digestJson(snapshot);
  return {
    topic,
    snapshot,
    sourceDigest,
    fingerprint: digestJson({ topicId: topic.id, sourceDigest, providerName, modelName }),
  };
}

function digestJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
