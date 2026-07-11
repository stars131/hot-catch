import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createIdea } from "@/lib/services/idea-service";
import {
  createContentProject,
  createContentRevision,
  getContentProject,
} from "@/lib/services/content-project-service";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userAId = "";
let userBId = "";

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.user.create({ data: { email: `pipeline-a-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `pipeline-b-${runId}@example.com` } }),
  ]);
  userAId = a.id;
  userBId = b.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("idea to versioned content", () => {
  it("deduplicates the same saved hotspot and keeps observations", async () => {
    const input = {
      source: "hotspot" as const,
      platform: "xiaohongshu" as const,
      title: "测试热点",
      hotspot: {
        id: `hotspot-${runId}`,
        heat: 88,
        rank: 3,
        source: "integration-test",
      },
    };
    const first = await createIdea(userAId, input);
    const second = await createIdea(userAId, { ...input, hotspot: { ...input.hotspot, heat: 91 } });
    expect(second.id).toBe(first.id);

    const observationCount = await prisma.trendObservation.count({
      where: { userId: userAId, trendTopicId: first.trendTopicId ?? undefined },
    });
    expect(observationCount).toBe(2);
  });

  it("creates restorable revisions and rejects cross-user access", async () => {
    const idea = await createIdea(userAId, {
      source: "manual",
      platform: "douyin",
      title: "三十秒效率技巧",
    });
    const content = await createContentProject(userAId, {
      ideaId: idea.id,
      platform: "douyin",
      contentKind: "douyin_video_script",
      title: idea.title,
    });

    const revision1 = await createContentRevision(userAId, content.id, {
      source: "manual",
      title: "版本一",
      structuredContent: { shots: [{ startSec: 0, endSec: 3, voiceover: "开场" }] },
    });
    const revision2 = await createContentRevision(userAId, content.id, {
      source: "manual",
      title: "版本二",
      structuredContent: { shots: [{ startSec: 0, endSec: 4, voiceover: "新版开场" }] },
    });
    expect([revision1.revisionNumber, revision2.revisionNumber]).toEqual([1, 2]);

    await expect(getContentProject(userBId, content.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      createContentRevision(userBId, content.id, { source: "manual", title: "越权版本" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
