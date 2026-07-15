import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobType, Prisma } from "@prisma/client";
import { strFromU8, unzipSync } from "fflate";
import { prisma } from "@/lib/prisma";
import { getQueue } from "@/lib/jobs/queues";
import { createGenerationBatch } from "@/lib/services/generation-batch-service";
import { createAgentRunExport } from "@/lib/services/export-service";
import { createContentRevision } from "@/lib/services/content-project-service";
import {
  assertContentPublishingSupported,
  preparePublishRecord,
} from "@/lib/services/publishing-service";
import type { GenerationBatchInput } from "@/lib/validators/generation-batch";

const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userAId = "";
let userBId = "";
let conversationId = "";
let batchRunId = "";
let jobIds: string[] = [];

beforeAll(async () => {
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `c14-a-${testRunId}@example.com` } }),
    prisma.user.create({ data: { email: `c14-b-${testRunId}@example.com` } }),
  ]);
  userAId = userA.id;
  userBId = userB.id;
  const conversation = await prisma.conversation.create({
    data: { userId: userAId, title: "C14 creation package" },
  });
  conversationId = conversation.id;
});

afterAll(async () => {
  for (const jobId of jobIds) {
    const queueJob = await getQueue(JobType.analysis).getJob(jobId);
    if (queueJob) await queueJob.remove().catch(() => undefined);
  }
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("C14 generation batches and export", () => {
  it("creates five independent jobs and replays the same idempotency key", async () => {
    const input: GenerationBatchInput = {
      brief: "Create one practical, evidence-aware package for independent creators.",
      targetPlatforms: ["youtube", "tiktok", "instagram", "x", "reddit"],
      targetLocale: "ja-JP",
      skillIds: [],
    };
    const first = await createGenerationBatch({
      userId: userAId,
      conversationId,
      input: { ...input, targetPlatforms: [...input.targetPlatforms] },
      idempotencyKey: `c14-batch-${testRunId}`,
      uiLocale: "en-US",
    });
    const replay = await createGenerationBatch({
      userId: userAId,
      conversationId,
      input: { ...input, targetPlatforms: [...input.targetPlatforms] },
      idempotencyKey: `c14-batch-${testRunId}`,
      uiLocale: "en-US",
    });
    batchRunId = first.runId;
    jobIds = first.items.flatMap((item) => (item.jobId ? [item.jobId] : []));
    expect(first.items).toHaveLength(5);
    expect(new Set(first.items.map((item) => item.contentId)).size).toBe(5);
    expect(replay).toMatchObject({ runId: first.runId, replayed: true });

    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: conversationId },
    });
    expect(conversation.targetLocale).toBe("ja-JP");
    expect(conversation.targetPlatforms).toEqual(
      expect.arrayContaining([...input.targetPlatforms]),
    );
  });

  it("exports parseable files while excluding credentials, raw responses and Skill instructions", async () => {
    const contents = await prisma.generatedContent.findMany({
      where: { conversationId, userId: userAId },
      orderBy: { createdAt: "asc" },
    });
    for (const content of contents) {
      await createContentRevision(userAId, content.id, {
        source: "generated",
        title: `${content.platform} draft`,
        bodyText: `安全な本文 for ${content.platform}`,
        fullMarkdown: `# ${content.platform}\n\n安全な本文`,
        structuredContent: {
          title: `${content.platform} draft`,
          providerRawResponse: "TOP-SECRET-RAW",
          apiKey: "TOP-SECRET-KEY",
          nested: { token: "TOP-SECRET-TOKEN", safe: true },
        },
      });
      await prisma.generatedContent.update({
        where: { id: content.id },
        data: {
          modelName: "openai/test-model",
          promptVersion: "c14-test",
          skillSnapshots: [
            {
              id: "custom.test",
              name: "Test Skill",
              source: "custom",
              version: "1",
              instructions: "TOP-SECRET-SKILL-INSTRUCTION",
            },
          ] as Prisma.InputJsonValue,
        },
      });
    }
    await prisma.processingJob.updateMany({
      where: { id: { in: jobIds } },
      data: { status: "succeeded", progress: 100, completedAt: new Date() },
    });
    const exported = await createAgentRunExport({
      userId: userAId,
      runId: batchRunId,
      uiLocale: "en-US",
    });
    const files = unzipSync(exported.bytes);
    expect(Object.keys(files)).toContain("manifest.json");
    expect(Object.keys(files)).toContain("youtube/content.md");
    expect(Object.keys(files)).toContain("reddit/asset-checklist.md");
    expect(strFromU8(files["youtube/content.md"])).toContain("安全な本文");
    const manifest = JSON.parse(strFromU8(files["manifest.json"]));
    expect(manifest).toMatchObject({
      schema: "startrace-export/v1",
      runId: batchRunId,
      targetLocale: "ja-JP",
      privacy: {
        credentialsIncluded: false,
        providerRawResponsesIncluded: false,
        customSkillInstructionsIncluded: false,
        fictionalMediaIncluded: false,
      },
    });
    const allText = Object.values(files).map((value) => strFromU8(value)).join("\n");
    expect(allText).not.toContain("TOP-SECRET");
    await expect(
      createAgentRunExport({ userId: userBId, runId: batchRunId, uiLocale: "en-US" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects foreign publishing before creating any PublishRecord", async () => {
    const youtube = await prisma.generatedContent.findFirstOrThrow({
      where: { conversationId, platform: "youtube" },
    });
    const before = await prisma.publishRecord.count({ where: { contentId: youtube.id } });
    await expect(
      assertContentPublishingSupported(userAId, youtube.id),
    ).rejects.toMatchObject({ code: "PUBLISHING_NOT_SUPPORTED" });
    await expect(
      preparePublishRecord(userAId, {
        contentId: youtube.id,
        accountId: "must-not-be-used",
        assets: [{ url: "https://assets.example/video.mp4", type: "video" }],
      }),
    ).rejects.toMatchObject({ code: "PUBLISHING_NOT_SUPPORTED" });
    expect(await prisma.publishRecord.count({ where: { contentId: youtube.id } })).toBe(before);
  });
});
