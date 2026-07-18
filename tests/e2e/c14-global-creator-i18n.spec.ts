import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PrismaClient, type ContentKind, type Platform } from "@prisma/client";
import { strFromU8, unzipSync } from "fflate";
import { fixtureChecksum } from "./helpers/checksum";

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
  const match = envFile.match(/^DATABASE_URL="?([^"\r\n]+)"?/m);
  if (!match) throw new Error("DATABASE_URL is missing from .env");
  return match[1];
}

const prisma = new PrismaClient({ datasources: { db: { url: loadDatabaseUrl() } } });
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const platforms: Platform[] = ["youtube", "tiktok", "instagram", "x", "reddit"];
const contentKinds: Record<Platform, ContentKind> = {
  xiaohongshu: "xhs_graphic",
  douyin: "douyin_video_script",
  youtube: "youtube_video_package",
  tiktok: "tiktok_short_video_script",
  instagram: "instagram_carousel",
  x: "x_thread",
  reddit: "reddit_post",
};

let userId = "";
let conversationId = "";
let runId = "";
let setupMessageId = "";
const contentByPlatform = new Map<Platform, string>();
const revisionByPlatform = new Map<Platform, string>();

test.beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: "dev@example.com" },
    update: {},
    create: { email: "dev@example.com", name: "Dev User" },
  });
  userId = user.id;
  const conversation = await prisma.conversation.create({
    data: {
      userId,
      title: `C14 global creator ${suffix}`,
      targetPlatforms: platforms,
      targetLocale: "ja-JP",
    },
  });
  conversationId = conversation.id;
  const run = await prisma.agentRun.create({
    data: {
      userId,
      conversationId,
      command: "content.generate_bundle",
      status: "completed",
      input: {
        brief: "Five-platform Japanese package",
        targetPlatforms: platforms,
        targetLocale: "ja-JP",
        expectedCount: platforms.length,
      },
      completedAt: new Date(),
    },
  });
  runId = run.id;

  for (const [index, platform] of platforms.entries()) {
    const content = await prisma.generatedContent.create({
      data: {
        userId,
        conversationId,
        platform,
        contentKind: contentKinds[platform],
        contentLocale: "ja-JP",
        outputType: contentKinds[platform],
        title: `${platform} 日本語パッケージ`,
        bodyText: `${platform} 向けの安全な本文です。`,
        fullMarkdown: `# ${platform}\n\n安全な本文です。`,
        status: "saved",
        selectedSkillIds: ["builtin.expand-hook", "builtin.risk-check"],
      },
    });
    contentByPlatform.set(platform, content.id);
    const revision = await prisma.contentRevision.create({
      data: {
        userId,
        contentId: content.id,
        revisionNumber: 1,
        source: "generated",
        title: content.title,
        bodyText: content.bodyText,
        fullMarkdown: content.fullMarkdown,
        structuredContent: { platform, locale: "ja-JP", body: "安全な本文です。" },
        checksum: fixtureChecksum(`${platform}-${index}-${suffix}`),
      },
    });
    revisionByPlatform.set(platform, revision.id);
    await prisma.processingJob.create({
      data: {
        userId,
        type: "analysis",
        queueName: "analysis",
        action: "content.generate",
        agentRunId: runId,
        status: "succeeded",
        progress: 100,
        stage: "完成",
        input: { contentId: content.id, uiLocale: "en-US" },
        resultId: content.id,
        completedAt: new Date(Date.now() + index),
        idempotencyKey: `c14-e2e-${suffix}-${platform}`,
      },
    });
  }
  const setupMessage = await prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content: "请在卡片中选择五个平台、日语和本次使用的 Skill。",
      metadata: {
        protocol: "star-chat/v1",
        cards: [
          {
            id: `card-c15-setup-${suffix}`,
            version: 1,
            type: "creation_setup",
            brief: "五个平台的日语创作包",
            uiLocale: "zh-CN",
            maxPlatforms: 5,
            platformOptions: platforms.map((platform) => ({
              id: platform,
              label: platform === "youtube" ? "YouTube" : platform === "tiktok" ? "TikTok" : platform === "instagram" ? "Instagram" : platform === "x" ? "X" : "Reddit",
              description: "海外平台创作包",
              group: "global",
            })),
            localeOptions: [
              { id: "zh-CN", label: "简体中文" },
              { id: "en-US", label: "英语" },
              { id: "ja-JP", label: "日语" },
            ],
            skillOptions: [
              { id: "builtin.expand-hook", label: "强化开头钩子" },
              { id: "builtin.risk-check", label: "风险与合规检查" },
            ],
            defaultPlatformIds: ["youtube"],
            defaultLocaleId: "zh-CN",
            defaultSkillIds: [],
            confirmAction: {
              actionId: "creation.generate_bundle",
              label: "确认并开始生成",
              appearance: "primary",
            },
          },
        ],
      },
    },
  });
  setupMessageId = setupMessage.id;
});

test.afterAll(async () => {
  await prisma.processingJob.deleteMany({ where: { agentRunId: runId } });
  await prisma.agentRun.deleteMany({ where: { id: runId, userId } });
  await prisma.generatedContent.deleteMany({
    where: { id: { in: [...contentByPlatform.values()] }, userId },
  });
  await prisma.conversation.deleteMany({ where: { id: conversationId, userId } });
  await prisma.$disconnect();
});

test("conversational five-platform setup preserves Japanese, Skills, editing and UTF-8 ZIP", async ({ page, request }) => {
  test.setTimeout(120_000);

  await request.post("/api/settings/locale", { data: { locale: "zh-CN" } });
  await page.route(`**/api/conversations/${conversationId}/actions`, async (route) => {
    const payload = route.request().postDataJSON();
    expect(payload).toMatchObject({
      sourceMessageId: setupMessageId,
      actionId: "creation.generate_bundle",
    });
    expect(payload.values.optionIds).toEqual(
      expect.arrayContaining([
        ...platforms,
        "ja-JP",
        "builtin.expand-hook",
        "builtin.risk-check",
      ]),
    );
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        targetPlatforms: platforms,
        targetLocale: "ja-JP",
        activeSkillIds: ["builtin.expand-hook", "builtin.risk-check"],
      },
    });
    const clientMessageId = `action:card-c15-setup-${suffix}:creation.generate_bundle`;
    const resultMessage = await prisma.message.upsert({
      where: {
        conversationId_clientMessageId: { conversationId, clientMessageId },
      },
      update: {},
      create: {
        conversationId,
        role: "assistant",
        content: "五个平台的日语创作包已生成，可以逐项编辑与导出。",
        clientMessageId,
        metadata: {
          protocol: "star-chat/v1",
          runId,
          cards: platforms.map((platform) => ({
            id: `artifact-${platform}-${suffix}`,
            version: 1,
            type: "artifact",
            contentId: contentByPlatform.get(platform),
            revisionId: revisionByPlatform.get(platform),
            revisionNumber: 1,
            platform,
            contentKind: contentKinds[platform],
            contentLocale: "ja-JP",
            title: `${platform} 日本語パッケージ`,
            preview: `${platform} 向けの安全な本文です。`,
            actions: [
              { actionId: "artifact.open", label: "打开编辑", appearance: "primary" },
            ],
          })),
        },
      },
    });
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ resultMessage, replayed: false }),
    });
  });

  await page.goto(`/creator?conversationId=${conversationId}`);
  const setupCard = page.locator('[data-testid^="card-creation-setup-"]');
  await expect(setupCard).toBeVisible({ timeout: 15_000 });
  for (const platform of ["TikTok", "Instagram", "X", "Reddit"]) {
    await setupCard.getByRole("button", { name: new RegExp(platform) }).click();
  }
  await setupCard.getByRole("button", { name: "选择账号", exact: true }).click();
  await setupCard.getByRole("button", { name: "选择语言", exact: true }).click();
  await setupCard.getByRole("button", { name: "日语", exact: true }).click();
  await setupCard.getByRole("button", { name: /强化开头钩子/ }).click();
  await setupCard.getByRole("button", { name: /风险与合规检查/ }).click();

  await page.getByRole("button", { name: "语言: English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page).toHaveURL(new RegExp(`/creator\\?conversationId=${conversationId}`));
  await setupCard.getByRole("button", { name: /选择目标平台/ }).click();
  for (const platform of platforms) {
    const name = platform === "youtube" ? "YouTube" : platform === "tiktok" ? "TikTok" : platform === "instagram" ? "Instagram" : platform === "x" ? "X" : "Reddit";
    await expect(setupCard.getByRole("button", { name: new RegExp(name) })).toHaveAttribute("aria-pressed", "true");
  }
  await setupCard.getByRole("button", { name: "选择账号", exact: true }).click();
  await setupCard.getByRole("button", { name: "选择语言", exact: true }).click();
  await expect(setupCard.getByRole("button", { name: "日语", exact: true })).toHaveAttribute("aria-pressed", "true");
  await setupCard.getByRole("button", { name: "日语", exact: true }).click();
  await expect(setupCard.getByRole("button", { name: /强化开头钩子/ })).toHaveAttribute("aria-pressed", "true");
  await expect(setupCard.getByRole("button", { name: /风险与合规检查/ })).toHaveAttribute("aria-pressed", "true");

  await setupCard.getByRole("button", { name: "检查设置", exact: true }).click();
  await setupCard.getByRole("button", { name: "确认并开始生成" }).click();
  for (const platform of platforms) {
    await expect(page.getByTestId(`card-artifact-artifact-${platform}-${suffix}`)).toBeVisible();
  }

  const youtubeCard = page.getByTestId(`card-artifact-artifact-youtube-${suffix}`);
  await youtubeCard.getByRole("button", { name: "Open editor" }).click();
  await page.locator("#global-editor-description").fill("編集済みの日本語本文");
  await expect(page.getByTestId("artifact-save-state")).toContainText("已保存 v2", {
    timeout: 15_000,
  });

  const exported = await request.get(`/api/agent-runs/${runId}/export`);
  expect(exported.ok()).toBeTruthy();
  const files = unzipSync(new Uint8Array(await exported.body()));
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  expect(manifest.schema).toBe("startrace-export/v1");
  expect(manifest.targetLocale).toBe("ja-JP");
  expect(Object.keys(files)).toEqual(expect.arrayContaining([
    "youtube/content.md",
    "tiktok/content.json",
    "instagram/asset-checklist.md",
    "x/content.md",
    "reddit/content.json",
  ]));
  expect(strFromU8(files["youtube/content.md"])).toContain("編集済みの日本語本文");
});
