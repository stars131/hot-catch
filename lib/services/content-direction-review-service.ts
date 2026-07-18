import { createHash } from "node:crypto";
import { DirectionReviewStage, Prisma } from "@prisma/client";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { createLlmProvider } from "@/lib/providers/factory";
import {
  directionSnapshotSchema,
  type DirectionManifest,
  type DirectionSnapshot,
} from "@/lib/creator/creative-direction";
import type { DirectionReviewCard } from "@/lib/creator/chat-protocol";

const REVIEW_PROMPT_VERSION = "content-direction-review/v2";

const modelReviewSchema = z.object({
  summary: z.string().trim().min(1).max(800),
  criteria: z.array(z.object({
    key: z.string().trim().min(1).max(100),
    score: z.number().min(0).max(100),
    passed: z.boolean(),
    reason: z.string().trim().min(1).max(500),
  }).strict()).max(16),
  suggestions: z.array(z.string().trim().min(1).max(300)).max(8),
}).strict();

export type DirectionReviewResult = {
  id: string;
  contentId: string;
  revisionId: string;
  revisionNumber: number;
  stage: "generation" | "publish";
  status: "passed" | "needs_attention" | "unavailable";
  primaryLabel: string;
  secondaryLabel?: string;
  score?: number;
  summary: string;
  criteria: Array<{
    key: string;
    label: string;
    score: number;
    maxScore: number;
    passed: boolean;
    reason: string;
    severity: "advisory" | "important";
  }>;
  suggestions: string[];
};

export async function reviewContentDirection(input: {
  userId: string;
  contentId: string;
  revisionId?: string;
  stage: "generation" | "publish";
}): Promise<DirectionReviewResult | null> {
  const content = await prisma.generatedContent.findFirst({
    where: { id: input.contentId, userId: input.userId },
    include: {
      revisions: {
        where: input.revisionId ? { id: input.revisionId } : undefined,
        orderBy: { revisionNumber: "desc" },
        take: 1,
      },
    },
  });
  if (!content) throw new AppError("NOT_FOUND", "内容项目不存在。", 404);
  const revision = content.revisions[0];
  if (!revision) throw new AppError("VALIDATION_ERROR", "内容还没有可审查的版本。", 422);
  if (input.revisionId && revision.id !== input.revisionId) {
    throw new AppError("NOT_FOUND", "内容版本不存在或不属于当前账号。", 404);
  }
  const direction = directionFromContentSnapshot(content.contextSnapshot);
  if (!direction) return null;
  const inputHash = hashValue({
    checksum: revision.checksum,
    stage: input.stage,
    direction,
    promptVersion: REVIEW_PROMPT_VERSION,
  });
  const stage = input.stage === "publish"
    ? DirectionReviewStage.publish
    : DirectionReviewStage.generation;
  const cached = await prisma.contentDirectionReview.findUnique({
    where: { revisionId_stage_inputHash: { revisionId: revision.id, stage, inputHash } },
  });
  if (cached) return resultFromRow(cached, revision.revisionNumber, direction);

  const expected = expectedCriteria(direction);
  let status: "passed" | "needs_attention" | "unavailable" = "unavailable";
  let result: Omit<DirectionReviewResult, "id" | "contentId" | "revisionId" | "revisionNumber" | "stage" | "status">;
  let modelProvider: string | null = null;
  let modelName: string | null = null;
  try {
    const provider = await createLlmProvider(input.userId);
    modelProvider = provider.name;
    modelName = provider.model;
    const output = await provider.generateStructured({
      system: buildDirectionReviewSystem(input.stage),
      prompt: JSON.stringify({
        stage: input.stage,
        platform: content.platform,
        contentKind: content.contentKind,
        directions: direction,
        criteria: expected.map((item) => ({
          key: item.key,
          label: item.label,
          description: item.description,
          severity: item.severity,
        })),
        content: {
          originalRequest: content.inputText,
          title: revision.title,
          bodyText: revision.bodyText,
          structuredContent: truncateJson(revision.structuredContent, 16000),
        },
      }),
      schema: modelReviewSchema,
      temperature: 0.1,
    });
    result = normalizeReview(output, expected, direction);
    const threshold = Math.max(direction.primary.review.passThreshold, 72);
    const importantFailure = result.criteria.some(
      (item) => item.severity === "important" && item.score < item.maxScore * 0.5,
    );
    status = (result.score ?? 0) >= threshold && !importantFailure
      ? "passed"
      : "needs_attention";
  } catch {
    result = {
      primaryLabel: direction.primary.labels.zhCN,
      ...(direction.secondary ? { secondaryLabel: direction.secondary.labels.zhCN } : {}),
      summary: "方向语义审查暂时不可用。平台硬规则与人工发布确认仍会继续执行。",
      criteria: [],
      suggestions: ["检查默认模型连接后重新审查。"],
    };
  }

  let row;
  try {
    row = await prisma.contentDirectionReview.create({
      data: {
        userId: input.userId,
        contentId: content.id,
        revisionId: revision.id,
        stage,
        status,
        inputHash,
        directionSnapshot: direction as unknown as Prisma.InputJsonValue,
        result: result as unknown as Prisma.InputJsonValue,
        modelProvider,
        modelName,
        promptVersion: REVIEW_PROMPT_VERSION,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.contentDirectionReview.findUnique({
        where: { revisionId_stage_inputHash: { revisionId: revision.id, stage, inputHash } },
      });
      if (raced) return resultFromRow(raced, revision.revisionNumber, direction);
    }
    throw error;
  }
  return {
    id: row.id,
    contentId: content.id,
    revisionId: revision.id,
    revisionNumber: revision.revisionNumber,
    stage: input.stage,
    status,
    ...result,
  };
}

export function directionReviewCard(review: DirectionReviewResult): DirectionReviewCard {
  return {
    id: `card-direction-review-${review.id.slice(-12)}`,
    version: 1,
    type: "direction_review",
    contentId: review.contentId,
    revisionId: review.revisionId,
    revisionNumber: review.revisionNumber,
    stage: review.stage,
    status: review.status,
    primaryLabel: review.primaryLabel,
    ...(review.secondaryLabel ? { secondaryLabel: review.secondaryLabel } : {}),
    ...(review.score === undefined ? {} : { score: review.score }),
    summary: review.summary,
    criteria: review.criteria.map((criterion) => ({
      key: criterion.key,
      label: criterion.label,
      score: criterion.score,
      maxScore: criterion.maxScore,
      passed: criterion.passed,
      reason: criterion.reason,
    })),
    suggestions: review.suggestions,
    actions: review.status === "needs_attention"
      ? [{ actionId: "direction.repair", label: "按建议创建修订", appearance: "primary" }]
      : [],
  };
}

export function directionReviewReadinessItem(review: DirectionReviewResult) {
  return {
    key: "direction.review",
    label: "表达方向审查",
    level: review.status === "passed" ? "pass" as const : "warn" as const,
    detail: review.status === "passed"
      ? `${review.primaryLabel}${review.secondaryLabel ? ` + ${review.secondaryLabel}` : ""}匹配度 ${review.score ?? 0}/100。`
      : review.summary,
  };
}

export function directionFromContentSnapshot(value: unknown): DirectionSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const parsed = directionSnapshotSchema.safeParse(
    record.creativeDirection ?? record.creativeDirectionSnapshot ?? record.directionSelection,
  );
  return parsed.success ? parsed.data : null;
}

function expectedCriteria(direction: DirectionSnapshot) {
  const directionFactor = 0.9;
  const primary = scaleCriteria(direction.primary, "primary", 0.75 * directionFactor);
  const secondary = direction.secondary
    ? scaleCriteria(direction.secondary, "secondary", 0.25 * directionFactor)
    : [];
  const directionCriteria = direction.secondary
    ? [...primary, ...secondary]
    : scaleCriteria(direction.primary, "primary", directionFactor);
  return [
    ...directionCriteria,
    {
      key: "request:constraints",
      label: "当前需求 · 约束遵循",
      description: "逐项核对原始请求中的禁止项、必须项、受众、范围和证据边界；不得用方向模板覆盖用户明确要求。",
      severity: "important" as const,
      maxScore: 10,
    },
  ];
}

function scaleCriteria(manifest: DirectionManifest, prefix: string, factor: number) {
  return manifest.review.criteria.map((criterion) => ({
    key: `${prefix}:${manifest.key}:${criterion.key}`,
    label: `${manifest.labels.zhCN} · ${criterion.label}`,
    description: criterion.description,
    severity: criterion.severity,
    maxScore: criterion.weight * factor,
  }));
}

function normalizeReview(
  output: z.infer<typeof modelReviewSchema>,
  expected: ReturnType<typeof expectedCriteria>,
  direction: DirectionSnapshot,
) {
  const byKey = new Map(output.criteria.map((item) => [item.key, item]));
  const criteria = expected.map((definition) => {
    const model = byKey.get(definition.key);
    const ratio = model?.score ?? 0;
    return {
      key: definition.key,
      label: definition.label,
      score: round2((ratio / 100) * definition.maxScore),
      maxScore: round2(definition.maxScore),
      passed: Boolean(model?.passed && ratio >= 60),
      reason: model?.reason ?? "模型未返回这一项的判断。",
      severity: definition.severity,
    };
  });
  const maxScore = criteria.reduce((sum, item) => sum + item.maxScore, 0);
  const score = maxScore
    ? Math.round((criteria.reduce((sum, item) => sum + item.score, 0) / maxScore) * 100)
    : 0;
  return {
    primaryLabel: direction.primary.labels.zhCN,
    ...(direction.secondary ? { secondaryLabel: direction.secondary.labels.zhCN } : {}),
    score,
    summary: output.summary,
    criteria,
    suggestions: output.suggestions,
  };
}

function resultFromRow(
  row: {
    id: string;
    contentId: string;
    revisionId: string;
    stage: DirectionReviewStage;
    status: "passed" | "needs_attention" | "unavailable";
    result: Prisma.JsonValue | null;
  },
  revisionNumber: number,
  direction: DirectionSnapshot,
): DirectionReviewResult {
  const result = row.result && typeof row.result === "object" && !Array.isArray(row.result)
    ? row.result as unknown as Omit<DirectionReviewResult, "id" | "contentId" | "revisionId" | "revisionNumber" | "stage" | "status">
    : {
        primaryLabel: direction.primary.labels.zhCN,
        summary: "方向审查结果无法读取。",
        criteria: [],
        suggestions: [],
      };
  return {
    id: row.id,
    contentId: row.contentId,
    revisionId: row.revisionId,
    revisionNumber,
    stage: row.stage === DirectionReviewStage.publish ? "publish" : "generation",
    status: row.status,
    ...result,
  };
}

export function buildDirectionReviewSystem(stage: "generation" | "publish") {
  return [
    "你是内容方向审查员。只依据给定内容、方向 Manifest 和审查标准判断，不补写事实或外部知识。",
    "逐项使用原始 criterion key 返回 0-100 分、是否通过和具体理由。不要漏项，不要发明新 key。",
    stage === "publish"
      ? "这是发布前完整审查：严格检查结构、证据边界、适用条件和误导风险。"
      : "这是生成后轻量审查：优先判断内容骨架是否符合主方向，以及辅方向是否被正确使用。",
    "方向偏离应给出可执行修改建议，但不得自行发布或声称已经修改。",
    `Only return one JSON object. Do not use Markdown or add fields. Use this exact contract:
{
  "summary": "overall review conclusion",
  "criteria": [
    {
      "key": "copy the exact key from the supplied criteria array",
      "score": 0,
      "passed": false,
      "reason": "specific judgment grounded in the supplied content"
    }
  ],
  "suggestions": ["specific revision action"]
}`,
    "Return every supplied criterion key exactly once and no other keys. score must be a JSON number from 0 to 100, passed must be a JSON boolean, and suggestions must be an array with at most 8 strings.",
  ].join("\n");
}

function truncateJson(value: unknown, max: number) {
  const serialized = JSON.stringify(value ?? null);
  return serialized.length <= max ? value : serialized.slice(0, max);
}

function hashValue(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
