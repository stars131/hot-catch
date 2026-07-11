import { createHash } from "node:crypto";
import { Prisma, type RevisionSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { z } from "zod";
import type {
  createContentProjectSchema,
  createRevisionSchema,
} from "@/lib/validators/content-project";

type CreateContentProjectInput = z.infer<typeof createContentProjectSchema>;
type CreateRevisionInput = z.infer<typeof createRevisionSchema>;

export async function createContentProject(
  userId: string,
  input: CreateContentProjectInput,
) {
  await assertOwnedRelations(userId, input);
  return prisma.$transaction(async (tx) => {
    const content = await tx.generatedContent.create({
      data: {
        userId,
        ideaId: input.ideaId,
        personaId: input.personaId,
        styleProfileId: input.styleProfileId,
        platform: input.platform,
        contentKind: input.contentKind,
        outputType: input.contentKind,
        title: input.title,
        inputText: input.inputText,
        inputType: input.ideaId ? "idea" : "draft",
      },
    });
    if (input.ideaId) {
      await tx.idea.update({
        where: { id: input.ideaId },
        data: { status: "creating" },
      });
    }
    return content;
  });
}

export async function getContentProject(userId: string, contentId: string) {
  const content = await prisma.generatedContent.findFirst({
    where: { id: contentId, userId },
    include: {
      idea: true,
      styleProfile: true,
      scoringRubric: true,
      revisions: { orderBy: { revisionNumber: "desc" } },
      publishRecords: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!content) throw new AppError("NOT_FOUND", "内容项目不存在。", 404);
  return content;
}

export async function createContentRevision(
  userId: string,
  contentId: string,
  input: CreateRevisionInput,
) {
  const content = await prisma.generatedContent.findFirst({
    where: { id: contentId, userId },
    select: { id: true },
  });
  if (!content) throw new AppError("NOT_FOUND", "内容项目不存在。", 404);

  const structuredContent = toJson(input.structuredContent);
  const checksum = createHash("sha256")
    .update(
      JSON.stringify({
        title: input.title ?? null,
        bodyText: input.bodyText ?? null,
        structuredContent: structuredContent ?? null,
        fullMarkdown: input.fullMarkdown ?? null,
      }),
    )
    .digest("hex");

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const latest = await tx.contentRevision.aggregate({
          where: { contentId },
          _max: { revisionNumber: true },
        });
        const revision = await tx.contentRevision.create({
          data: {
            userId,
            contentId,
            revisionNumber: (latest._max.revisionNumber ?? 0) + 1,
            source: input.source as RevisionSource,
            title: input.title,
            bodyText: input.bodyText,
            structuredContent,
            fullMarkdown: input.fullMarkdown,
            checksum,
          },
        });
        await tx.generatedContent.update({
          where: { id: contentId },
          data: {
            title: input.title,
            bodyText: input.bodyText,
            scriptSpec: structuredContent,
            fullMarkdown: input.fullMarkdown,
            status: "saved",
          },
        });
        return revision;
      });
    } catch (error) {
      const isRevisionRace =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isRevisionRace || attempt === 1) throw error;
    }
  }
  throw new AppError("CONFLICT", "版本保存冲突，请重试。", 409);
}

async function assertOwnedRelations(
  userId: string,
  input: CreateContentProjectInput,
) {
  const [idea, persona, styleProfile] = await Promise.all([
    input.ideaId
      ? prisma.idea.findFirst({ where: { id: input.ideaId, userId }, select: { id: true } })
      : null,
    input.personaId
      ? prisma.persona.findFirst({ where: { id: input.personaId, userId }, select: { id: true } })
      : null,
    input.styleProfileId
      ? prisma.creatorStyleProfile.findFirst({
          where: { id: input.styleProfileId, userId, status: "approved" },
          select: { id: true },
        })
      : null,
  ]);
  if (input.ideaId && !idea) throw new AppError("NOT_FOUND", "选题不存在。", 404);
  if (input.personaId && !persona) throw new AppError("NOT_FOUND", "人设不存在。", 404);
  if (input.styleProfileId && !styleProfile) {
    throw new AppError("VALIDATION_ERROR", "风格画像不存在或尚未审核通过。", 422);
  }
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
