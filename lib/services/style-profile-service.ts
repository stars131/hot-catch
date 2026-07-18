import { Prisma, type StyleProfileStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { z } from "zod";
import type { updateStyleProfileSchema } from "@/lib/validators/style-profile";

type UpdateStyleProfileInput = z.infer<typeof updateStyleProfileSchema>;

export async function listStyleProfiles(userId: string) {
  return prisma.creatorStyleProfile.findMany({
    where: { userId, status: { not: "archived" } },
    include: { _count: { select: { evidence: true, contents: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getStyleProfile(userId: string, profileId: string) {
  const profile = await prisma.creatorStyleProfile.findFirst({
    where: { id: profileId, userId },
    include: {
      evidence: {
        include: { benchmarkNote: { select: { title: true, noteUrl: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!profile) throw new AppError("NOT_FOUND", "风格画像不存在。", 404);
  return profile;
}

export async function updateStyleProfile(
  userId: string,
  profileId: string,
  input: UpdateStyleProfileInput,
) {
  const existing = await prisma.creatorStyleProfile.findFirst({
    where: { id: profileId, userId },
  });
  if (!existing) throw new AppError("NOT_FOUND", "风格画像不存在。", 404);

  const status = input.status as StyleProfileStatus | undefined;
  return prisma.creatorStyleProfile.update({
    where: { id: profileId },
    data: {
      name: input.name,
      status,
      summary: input.summary,
      themes: toJson(input.themes),
      hooks: toJson(input.hooks),
      pacing: toJson(input.pacing),
      tone: toJson(input.tone),
      visualLanguage: toJson(input.visualLanguage),
      boundaries: toJson(input.boundaries),
      approvedAt: status === "approved" ? new Date() : status ? null : undefined,
    },
  });
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
