import { describe, expect, it } from "vitest";
import { Platform } from "@prisma/client";
import {
  normalizeAccount,
  normalizeContent,
} from "@/lib/providers/tikhub/normalizer";
import { TikHubProvider } from "@/lib/providers/tikhub/provider";

describe("TikHub normalization", () => {
  it("maps a Xiaohongshu account response into the stable provider model", () => {
    const account = normalizeAccount(Platform.xiaohongshu, {
      data: {
        user_id: "61b46d790000000010008153",
        nickname: "示例创作者",
        desc: "简介",
        images: "https://img.example/avatar.jpg",
        fans: "12,345",
        follows: 87,
        notes: 42,
      },
    });

    expect(account).toMatchObject({
      platformAccountId: "61b46d790000000010008153",
      nickname: "示例创作者",
      followerCount: 12345,
      contentCount: 42,
    });
  });

  it("maps Douyin video metrics and milliseconds", () => {
    const content = normalizeContent(Platform.douyin, {
      data: {
        aweme_detail: {
          aweme_id: "7372484719365098803",
          desc: "一条视频",
          duration: 15340,
          create_time: 1_720_000_000,
          author: { sec_uid: "MS4wLjABAAAA-example" },
          statistics: {
            play_count: 1000,
            digg_count: 50,
            comment_count: 7,
            share_count: 3,
          },
        },
      },
    });

    expect(content).toMatchObject({
      platformContentId: "7372484719365098803",
      platformAccountId: "MS4wLjABAAAA-example",
      durationSec: 15,
      metrics: { views: 1000, likes: 50, comments: 7, shares: 3 },
    });
  });
});

describe("TikHub reference parsing", () => {
  const provider = new TikHubProvider("test-key");

  it("recognizes Xiaohongshu notes", async () => {
    await expect(
      provider.parseReference(
        "https://www.xiaohongshu.com/explore/697c0eee000000000a03c308",
      ),
    ).resolves.toMatchObject({
      platform: "xiaohongshu",
      kind: "content",
      platformContentId: "697c0eee000000000a03c308",
    });
  });

  it("recognizes Douyin videos", async () => {
    await expect(
      provider.parseReference("https://www.douyin.com/video/7372484719365098803"),
    ).resolves.toMatchObject({
      platform: "douyin",
      kind: "content",
      platformContentId: "7372484719365098803",
    });
  });
});
