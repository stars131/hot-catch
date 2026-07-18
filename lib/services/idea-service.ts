import { Prisma, type IdeaStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { z } from "zod";
import type { createIdeaSchema, updateIdeaSchema } from "@/lib/validators/ideas";

type CreateIdeaInput = z.infer<typeof createIdeaSchema>;
type UpdateIdeaInput = z.infer<typeof updateIdeaSchema>;

export async function listIdeas(userId: string, status?: IdeaStatus) {
  return prisma.idea.findMany({
    where: { userId, ...(status ? { status } : { status: { not: "archived" } }) },
    include: {
      trendTopic: { include: { observations: { orderBy: { observedAt: "desc" }, take: 3 } } },
      _count: { select: { contents: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createIdea(userId: string, input: CreateIdeaInput) {
  return prisma.$transaction(async (tx) => {
    let trendTopicId: string | undefined;

    if (input.source === "hotspot" && input.hotspot && input.platform) {
      const topic = await tx.trendTopic.upsert({
        where: {
          userId_platform_normalizedKey: {
            userId,
            platform: input.platform,
            normalizedKey: input.hotspot.id,
          },
        },
        update: {
          title: input.title,
          category: input.hotspot.category,
          currentRank: input.hotspot.rank,
          currentScore: input.hotspot.heat,
          lastObservedAt: new Date(),
        },
        create: {
          userId,
          platform: input.platform,
          normalizedKey: input.hotspot.id,
          title: input.title,
          category: input.hotspot.category,
          currentRank: input.hotspot.rank,
          currentScore: input.hotspot.heat,
        },
      });
      trendTopicId = topic.id;

      await tx.trendObservation.create({
        data: {
          userId,
          trendTopicId: topic.id,
          source: input.hotspot.source ?? "hotspot-aggregator",
          sourceUrl: input.hotspot.sourceUrl,
          rank: input.hotspot.rank,
          score: input.hotspot.heat,
          evidence: toJson({
            keywords: input.hotspot.keywords,
            raw: input.hotspot.evidence,
          }),
        },
      });

      const existing = await tx.idea.findFirst({
        where: { userId, trendTopicId: topic.id, status: { not: "archived" } },
        include: { trendTopic: true, _count: { select: { contents: true } } },
      });
      if (existing) return existing;
    }

    return tx.idea.create({
      data: {
        userId,
        trendTopicId,
        platform: input.platform,
        source: input.source,
        title: input.title,
        angle: input.angle,
        audience: input.audience,
        notes: input.notes,
        evidence: toJson(input.hotspot),
      },
      include: { trendTopic: true, _count: { select: { contents: true } } },
    });
  });
}

export async function updateIdea(
  userId: string,
  ideaId: string,
  input: UpdateIdeaInput,
) {
  const existing = await prisma.idea.findFirst({ where: { id: ideaId, userId } });
  if (!existing) throw new AppError("NOT_FOUND", "选题不存在。", 404);
  return prisma.idea.update({ where: { id: ideaId }, data: input });
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
