import { createHash } from "node:crypto";
import { Prisma, type RevisionSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { z } from "zod";
import {
  createContentProjectSchema,
  type createRevisionSchema,
} from "@/lib/validators/content-project";

type CreateContentProjectInput = z.input<typeof createContentProjectSchema>;
type NormalizedCreateContentProjectInput = z.output<typeof createContentProjectSchema>;
type CreateRevisionInput = z.infer<typeof createRevisionSchema>;

export async function createContentProject(
  userId: string,
  input: CreateContentProjectInput,
) {
  const normalized = createContentProjectSchema.parse(input);
  await assertOwnedRelations(userId, normalized);
  return prisma.$transaction(async (tx) => {
    const content = await tx.generatedContent.create({
      data: {
        userId,
        ideaId: normalized.ideaId,
        personaId: normalized.personaId,
        styleProfileId: normalized.styleProfileId,
        platform: normalized.platform,
        contentKind: normalized.contentKind,
        contentLocale: normalized.contentLocale,
        outputType: normalized.contentKind,
        title: normalized.title,
        inputText: normalized.inputText,
        inputType: normalized.ideaId ? "idea" : "draft",
      },
    });
    if (normalized.ideaId) {
      await tx.idea.update({
        where: { id: normalized.ideaId },
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
      contentReferences: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, sourceUrl: true, snapshot: true, createdAt: true },
      },
    },
  });
  if (!content) throw new AppError("NOT_FOUND", "内容项目不存在。", 404);
  return content;
}

type RevisionOptions = {
  /** Worker 生成版本的幂等键;重试命中唯一约束时复用既有版本。 */
  originJobId?: string;
  /** 服务端生成的来源说明(如恢复自哪个版本);不接受客户端提交。 */
  provenance?: Prisma.InputJsonValue;
};

export async function createContentRevision(
  userId: string,
  contentId: string,
  input: CreateRevisionInput,
  options: RevisionOptions = {},
) {
  const content = await prisma.generatedContent.findFirst({
    where: { id: contentId, userId },
    select: { id: true },
  });
  if (!content) throw new AppError("NOT_FOUND", "内容项目不存在。", 404);

  if (options.originJobId) {
    const replayed = await findRevisionByOriginJob(userId, contentId, options.originJobId);
    if (replayed) return replayed;
  }

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
            originJobId: options.originJobId,
            provenance: options.provenance,
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
      const isUniqueViolation =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUniqueViolation) throw error;
      // originJobId 撞唯一约束 = Worker 重试,直接复用既有版本
      if (options.originJobId) {
        const replayed = await findRevisionByOriginJob(userId, contentId, options.originJobId);
        if (replayed) return replayed;
      }
      // 否则是 revisionNumber 并发竞争,重试一次
      if (attempt === 1) throw error;
    }
  }
  throw new AppError("CONFLICT", "版本保存冲突，请重试。", 409);
}

/**
 * 恢复版本:payload 全部来自数据库中被选中的 revision,
 * 不接受客户端提交的正文,杜绝旧闭包草稿覆盖恢复内容。
 */
export async function restoreContentRevision(
  userId: string,
  contentId: string,
  fromRevisionId: string,
) {
  const source = await prisma.contentRevision.findFirst({
    where: { id: fromRevisionId, contentId, userId },
  });
  if (!source) throw new AppError("NOT_FOUND", "要恢复的版本不存在。", 404);
  return createContentRevision(
    userId,
    contentId,
    {
      source: "restored",
      title: source.title,
      bodyText: source.bodyText,
      structuredContent: source.structuredContent ?? undefined,
      fullMarkdown: source.fullMarkdown,
    },
    {
      provenance: {
        restoredFromRevisionId: source.id,
        restoredFromRevisionNumber: source.revisionNumber,
      },
    },
  );
}

async function findRevisionByOriginJob(
  userId: string,
  contentId: string,
  originJobId: string,
) {
  const existing = await prisma.contentRevision.findUnique({ where: { originJobId } });
  return existing && existing.userId === userId && existing.contentId === contentId
    ? existing
    : null;
}

async function assertOwnedRelations(
  userId: string,
  input: NormalizedCreateContentProjectInput,
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
