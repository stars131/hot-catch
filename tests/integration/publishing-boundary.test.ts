import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createContentProject, createContentRevision } from "@/lib/services/content-project-service";
import {
  getPublishRecord,
  preparePublishRecord,
} from "@/lib/services/publishing-service";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userAId = "";
let userBId = "";
let contentId = "";

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.user.create({ data: { email: `publish-a-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `publish-b-${runId}@example.com` } }),
  ]);
  userAId = a.id;
  userBId = b.id;
  const content = await createContentProject(userAId, {
    platform: "douyin",
    contentKind: "douyin_video_script",
    title: "发布边界测试",
  });
  contentId = content.id;
  await createContentRevision(userAId, content.id, {
    source: "manual",
    title: "发布边界测试",
    bodyText: "发布文案",
    structuredContent: { shots: [] },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("publishing boundary", () => {
  it("deduplicates local publish creation and blocks cross-user reads", async () => {
    const input = {
      contentId,
      accountId: "douyin-test-account",
      assets: [{ url: "https://assets.example/video.mp4", type: "video" as const }],
    };
    const first = await preparePublishRecord(userAId, input, `client-key-${runId}`);
    const second = await preparePublishRecord(userAId, input, `client-key-${runId}`);
    expect(second.id).toBe(first.id);
    await expect(getPublishRecord(userBId, first.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects an image-only Douyin publish", async () => {
    await expect(
      preparePublishRecord(userAId, {
        contentId,
        accountId: "douyin-test-account",
        assets: [{ url: "https://assets.example/image.jpg", type: "image" }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
