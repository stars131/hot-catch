import { Prisma, type Platform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import {
  DEFAULT_RUBRIC_RULES,
  scoreContent,
  type ScoredContentKind,
} from "@/lib/scoring/score";

export async function ensureActiveRubric(
  userId: string,
  platform: Platform,
  contentKind: ScoredContentKind,
) {
  const active = await prisma.scoringRubric.findFirst({
    where: { userId, platform, contentKind, status: "active" },
    orderBy: { version: "desc" },
  });
  if (active) return active;
  const latest = await prisma.scoringRubric.aggregate({
    where: { userId, platform, contentKind },
    _max: { version: true },
  });
  return prisma.scoringRubric.create({
    data: {
      userId,
      platform,
      contentKind,
      name: contentKind === "xhs_graphic" ? "小红书图文默认评分" : "抖音脚本默认评分",
      version: (latest._max.version ?? 0) + 1,
      status: "active",
      rules: DEFAULT_RUBRIC_RULES[contentKind] as unknown as Prisma.InputJsonValue,
      approvedAt: new Date(),
    },
  });
}

export async function scoreContentProject(userId: string, contentId: string) {
  const content = await prisma.generatedContent.findFirst({
    where: { id: contentId, userId },
    include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } },
  });
  if (!content) throw new AppError("NOT_FOUND", "内容项目不存在。", 404);
  if (
    content.contentKind !== "xhs_graphic" &&
    content.contentKind !== "douyin_video_script"
  ) {
    throw new AppError(
      "SCORING_NOT_SUPPORTED",
      "该平台首版使用平台检查清单，不执行国内平台评分。",
      422,
    );
  }
  const latest = content.revisions[0];
  const rubric = await ensureActiveRubric(userId, content.platform, content.contentKind);
  const score = scoreContent({
    kind: content.contentKind,
    title: latest?.title ?? content.title,
    bodyText: latest?.bodyText ?? content.bodyText,
    structuredContent: latest?.structuredContent ?? content.scriptSpec ?? content.pageStructure,
    riskNotes: content.riskNotes,
  });
  await prisma.generatedContent.update({
    where: { id: content.id },
    data: {
      scoringRubricId: rubric.id,
      scoreSnapshot: score as unknown as Prisma.InputJsonValue,
    },
  });
  return { score, rubric: { id: rubric.id, name: rubric.name, version: rubric.version } };
}
