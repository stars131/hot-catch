import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createIdea } from "@/lib/services/idea-service";
import {
  createContentProject,
  createContentRevision,
  getContentProject,
  restoreContentRevision,
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

  it("restores a revision from its stored payload, never from client state", async () => {
    const content = await createContentProject(userAId, {
      platform: "xiaohongshu",
      contentKind: "xhs_graphic",
      title: "恢复测试",
    });
    const revision1 = await createContentRevision(userAId, content.id, {
      source: "generated",
      title: "版本一标题",
      bodyText: "版本一正文",
      structuredContent: { title: "版本一标题", bodyText: "版本一正文", pages: [] },
      fullMarkdown: "# 版本一标题",
    });
    const revision2 = await createContentRevision(userAId, content.id, {
      source: "manual",
      title: "版本二标题",
      bodyText: "版本二正文",
      structuredContent: { title: "版本二标题", bodyText: "版本二正文", pages: [] },
      fullMarkdown: "# 版本二标题",
    });
    expect(revision2.revisionNumber).toBe(2);

    // 恢复 v1:新版本 payload 必须来自 v1 数据库记录
    const restored = await restoreContentRevision(userAId, content.id, revision1.id);
    expect(restored.revisionNumber).toBe(3);
    expect(restored.source).toBe("restored");
    expect(restored.title).toBe("版本一标题");
    expect(restored.bodyText).toBe("版本一正文");
    expect(restored.provenance).toMatchObject({
      restoredFromRevisionId: revision1.id,
      restoredFromRevisionNumber: 1,
    });

    // 主表同步为恢复后的内容
    const project = await getContentProject(userAId, content.id);
    expect(project.title).toBe("版本一标题");
    expect(project.revisions).toHaveLength(3);

    // 跨用户恢复被拒绝
    await expect(
      restoreContentRevision(userBId, content.id, revision1.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // 其他内容项目的版本不能被拿来恢复本项目
    const otherContent = await createContentProject(userAId, {
      platform: "xiaohongshu",
      contentKind: "xhs_graphic",
      title: "另一个项目",
    });
    await expect(
      restoreContentRevision(userAId, otherContent.id, revision1.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("reuses the same revision when a worker retries with one originJobId", async () => {
    const content = await createContentProject(userAId, {
      platform: "douyin",
      contentKind: "douyin_video_script",
      title: "重试幂等",
    });
    const originJobId = `job-${runId}`;
    const first = await createContentRevision(
      userAId,
      content.id,
      { source: "generated", title: "生成稿", bodyText: "正文" },
      { originJobId },
    );
    const retried = await createContentRevision(
      userAId,
      content.id,
      { source: "generated", title: "生成稿", bodyText: "正文" },
      { originJobId },
    );
    expect(retried.id).toBe(first.id);
    const count = await prisma.contentRevision.count({ where: { contentId: content.id } });
    expect(count).toBe(1);
  });
});
