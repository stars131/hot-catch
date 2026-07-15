import { strToU8, zipSync } from "fflate";
import { AppError } from "@/lib/errors";
import {
  isContentKindId,
  isPlatformId,
  type PlatformId,
  type UiLocale,
} from "@/lib/platforms/registry";
import { platformAssetChecklist } from "@/lib/platforms/server-registry";
import { prisma } from "@/lib/prisma";
import { jobErrorMessageKey, safeJobErrorMessage } from "@/lib/jobs/error-messages";

export async function createAgentRunExport(params: {
  userId: string;
  runId: string;
  uiLocale: UiLocale;
}) {
  const run = await prisma.agentRun.findFirst({
    where: { id: params.runId, userId: params.userId },
    include: { jobs: { orderBy: { createdAt: "asc" } } },
  });
  if (!run || run.command !== "content.generate_bundle") {
    throw new AppError("NOT_FOUND", "创作包不存在或不属于当前账号。", 404);
  }

  const latestJobByContent = new Map<
    string,
    { job: (typeof run.jobs)[number]; input: Record<string, unknown> }
  >();
  for (const job of run.jobs) {
    const input = asRecord(job.input);
    const contentId = typeof input.contentId === "string" ? input.contentId : job.id;
    latestJobByContent.set(contentId, { job, input });
  }
  const jobEntries = [...latestJobByContent.values()];
  const contentIds = jobEntries
    .map(({ input }) => input.contentId)
    .filter((value): value is string => typeof value === "string");
  const contents = await prisma.generatedContent.findMany({
    where: { userId: params.userId, id: { in: contentIds } },
    include: {
      revisions: { orderBy: { revisionNumber: "desc" }, take: 1 },
      contentReferences: {
        orderBy: { createdAt: "asc" },
        select: { sourceUrl: true, snapshot: true, createdAt: true },
      },
    },
  });
  const byId = new Map(contents.map((content) => [content.id, content]));
  const files: Record<string, Uint8Array> = {};
  const manifestItems: Array<Record<string, unknown>> = [];
  const sources: Array<Record<string, unknown>> = [];
  const generationRecords: Array<Record<string, unknown>> = [];

  for (const { job, input } of jobEntries) {
    const contentId = typeof input.contentId === "string" ? input.contentId : null;
    const content = contentId ? byId.get(contentId) : undefined;
    const platform = content?.platform;
    if (!content || !isPlatformId(platform) || !isContentKindId(content.contentKind)) {
      manifestItems.push({
        contentId,
        jobId: job.id,
        status: job.status,
        errorCode: job.errorCode ?? "CONTENT_NOT_AVAILABLE",
      });
      continue;
    }
    const revision = content.revisions[0];
    const directory = platformDirectory(platform);
    const messageKey = jobErrorMessageKey(job.errorCode, job.output);
    manifestItems.push({
      platform,
      contentKind: content.contentKind,
      contentLocale: content.contentLocale,
      contentId: content.id,
      jobId: job.id,
      status: job.status,
      revisionId: revision?.id ?? null,
      revisionNumber: revision?.revisionNumber ?? null,
      errorCode: job.errorCode,
      messageKey,
      errorMessage: safeJobErrorMessage(messageKey),
    });
    if (revision) {
      files[`${directory}/content.md`] = textFile(
        revision.fullMarkdown || revision.bodyText || revision.title || "",
      );
      files[`${directory}/content.json`] = jsonFile({
        schema: "startrace-content/v1",
        platform,
        contentKind: content.contentKind,
        contentLocale: content.contentLocale,
        title: revision.title,
        bodyText: revision.bodyText,
        structuredContent: sanitizeStructuredContent(revision.structuredContent),
      });
      files[`${directory}/asset-checklist.md`] = textFile(
        platformAssetChecklist(platform, params.uiLocale),
      );
    }
    for (const reference of content.contentReferences) {
      sources.push({
        platform,
        contentId: content.id,
        sourceUrl: reference.sourceUrl,
        importedAt: reference.createdAt.toISOString(),
        summary: sanitizeReferenceSnapshot(reference.snapshot),
      });
    }
    generationRecords.push({
      platform,
      contentId: content.id,
      model: content.modelName,
      promptVersion: content.promptVersion,
      generatedAt: revision?.createdAt.toISOString() ?? null,
      skills: sanitizeSkillSnapshots(content.skillSnapshots),
    });
  }

  const runInput = asRecord(run.input);
  const manifest = {
    schema: "startrace-export/v1",
    exportedAt: new Date().toISOString(),
    runId: run.id,
    status: run.status,
    targetLocale:
      typeof runInput.targetLocale === "string" ? runInput.targetLocale : null,
    items: manifestItems,
    privacy: {
      credentialsIncluded: false,
      providerRawResponsesIncluded: false,
      customSkillInstructionsIncluded: false,
      fictionalMediaIncluded: false,
    },
  };
  files["manifest.json"] = jsonFile(manifest);
  files["sources.json"] = jsonFile(sources);
  files["generation-records.json"] = jsonFile(generationRecords);
  files["README.md"] = textFile(
    params.uiLocale === "en-US"
      ? "# Startrace creation package\n\nReview every platform draft and asset checklist before publishing manually. No account credentials or provider raw responses are included."
      : "# 星迹内容助手创作包\n\n手动发布前，请逐个平台复核内容与素材清单。本导出包不包含账号凭证或供应商原始响应。",
  );

  return {
    fileName: `startrace-${run.id}.zip`,
    bytes: zipSync(files, { level: 6 }),
    manifest,
  };
}

function platformDirectory(platform: PlatformId) {
  return platform.replace(/[^a-z0-9_-]/g, "-");
}

function sanitizeReferenceSnapshot(value: unknown) {
  const snapshot = asRecord(value);
  const source = asRecord(snapshot.source);
  return {
    title: typeof source.title === "string" ? source.title : null,
    author: typeof source.author === "string" ? source.author : null,
    summary: typeof snapshot.summary === "string" ? snapshot.summary : null,
    facts: Array.isArray(snapshot.facts)
      ? snapshot.facts.slice(0, 20).map((fact) => {
          const item = asRecord(fact);
          return {
            label: typeof item.label === "string" ? item.label : "",
            excerpt: typeof item.excerpt === "string" ? item.excerpt : "",
          };
        })
      : [],
  };
}

function sanitizeSkillSnapshots(value: unknown) {
  return Array.isArray(value)
    ? value.slice(0, 8).map((snapshot) => {
        const item = asRecord(snapshot);
        return {
          id: typeof item.id === "string" ? item.id : null,
          name: typeof item.name === "string" ? item.name : null,
          source: typeof item.source === "string" ? item.source : null,
          version: typeof item.version === "string" ? item.version : null,
        };
      })
    : [];
}

const SENSITIVE_EXPORT_KEYS = /(?:api[_-]?key|token|secret|password|credential|provider[_-]?raw|raw[_-]?response|skill[_-]?instructions?)/i;

function sanitizeStructuredContent(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeStructuredContent);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_EXPORT_KEYS.test(key))
      .map(([key, child]) => [key, sanitizeStructuredContent(child)]),
  );
}

function textFile(value: string) {
  return strToU8(value);
}

function jsonFile(value: unknown) {
  return textFile(`${JSON.stringify(value, null, 2)}\n`);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
