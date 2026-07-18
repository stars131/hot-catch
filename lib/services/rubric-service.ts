import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { z } from "zod";
import type {
  activateScoringRubricSchema,
  createScoringRubricSchema,
} from "@/lib/validators/scoring-rubric";

type CreateInput = z.infer<typeof createScoringRubricSchema>;
type ActivateInput = z.infer<typeof activateScoringRubricSchema>;

export async function listScoringRubrics(userId: string) {
  return prisma.scoringRubric.findMany({
    where: { userId },
    orderBy: [{ platform: "asc" }, { contentKind: "asc" }, { version: "desc" }],
  });
}

export async function createScoringRubricVersion(userId: string, input: CreateInput) {
  const latest = await prisma.scoringRubric.aggregate({
    where: { userId, platform: input.platform, contentKind: input.contentKind },
    _max: { version: true },
  });
  return prisma.scoringRubric.create({
    data: {
      userId,
      platform: input.platform,
      contentKind: input.contentKind,
      name: input.name,
      version: (latest._max.version ?? 0) + 1,
      status: "draft",
      rules: JSON.parse(JSON.stringify(input.rules)) as Prisma.InputJsonValue,
    },
  });
}

export async function activateScoringRubric(
  userId: string,
  rubricId: string,
  input: ActivateInput,
) {
  const rubric = await prisma.scoringRubric.findFirst({
    where: { id: rubricId, userId, status: "draft" },
  });
  if (!rubric) throw new AppError("NOT_FOUND", "待启用的评分规则不存在。", 404);
  if (input.backtestResult.candidateScore <= input.backtestResult.previousScore) {
    throw new AppError(
      "VALIDATION_ERROR",
      "候选规则回测结果没有优于旧规则，不能启用。",
      422,
    );
  }
  return prisma.$transaction(async (tx) => {
    await tx.scoringRubric.updateMany({
      where: {
        userId,
        platform: rubric.platform,
        contentKind: rubric.contentKind,
        status: "active",
      },
      data: { status: "archived" },
    });
    return tx.scoringRubric.update({
      where: { id: rubric.id },
      data: {
        status: "active",
        approvedAt: new Date(),
        backtestResult: input.backtestResult,
      },
    });
  });
}
