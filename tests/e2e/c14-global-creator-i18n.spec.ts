import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PrismaClient, type ContentKind, type Platform } from "@prisma/client";
import { strFromU8, unzipSync } from "fflate";

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
let redditJobId = "";
const contentByPlatform = new Map<Platform, string>();

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
    await prisma.contentRevision.create({
      data: {
        userId,
        contentId: content.id,
        revisionNumber: 1,
        source: "generated",
        title: content.title,
        bodyText: content.bodyText,
        fullMarkdown: content.fullMarkdown,
        structuredContent: { platform, locale: "ja-JP", body: "安全な本文です。" },
        checksum: `c14-e2e-${suffix}-${platform}`,
      },
    });
    const failed = platform === "reddit";
    const job = await prisma.processingJob.create({
      data: {
        userId,
        type: "analysis",
        queueName: "analysis",
        action: "content.generate",
        agentRunId: runId,
        status: failed ? "failed" : "succeeded",
        progress: failed ? 50 : 100,
        stage: failed ? "等待重试" : "完成",
        errorCode: failed ? "CREDENTIAL_INVALID" : null,
        errorMessage: failed ? "provider raw error must not be shown" : null,
        input: { contentId: content.id, uiLocale: "en-US" },
        resultId: failed ? null : content.id,
        completedAt: new Date(Date.now() + index),
        idempotencyKey: `c14-e2e-${suffix}-${platform}`,
      },
    });
    if (platform === "reddit") redditJobId = job.id;
  }
});

test.afterAll(async () => {
  await prisma.processingJob.deleteMany({ where: { agentRunId: runId } });
  await prisma.agentRun.deleteMany({ where: { id: runId, userId } });
  await prisma.conversation.deleteMany({ where: { id: conversationId, userId } });
  await prisma.$disconnect();
});

test("five platforms, Japanese, multiple Skills, retry, edit and UTF-8 ZIP", async ({ page, request }) => {
  test.setTimeout(120_000);

  await page.route("**/api/conversations", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ conversation: { id: conversationId } }),
    });
  });
  await page.route(`**/api/conversations/${conversationId}/generation-batches`, async (route) => {
    const payload = route.request().postDataJSON();
    expect(payload.targetPlatforms).toEqual(platforms);
    expect(payload.targetLocale).toBe("ja-JP");
    expect(payload.skillIds).toEqual(
      expect.arrayContaining(["builtin.expand-hook", "builtin.risk-check"]),
    );
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        runId,
        items: platforms.map((platform) => ({
          platform,
          contentId: contentByPlatform.get(platform),
          jobId: platform === "reddit" ? redditJobId : `seed-${platform}`,
          status: platform === "reddit" ? "failed" : "succeeded",
          progress: platform === "reddit" ? 50 : 100,
          errorCode: platform === "reddit" ? "CREDENTIAL_INVALID" : null,
          errorMessage: platform === "reddit" ? "provider raw error must not be shown" : null,
          messageKey: platform === "reddit" ? "errors.credentialInvalid" : null,
        })),
      }),
    });
  });
  await page.route(`**/api/agent-runs/${runId}/items/${contentByPlatform.get("reddit")}/retry`, async (route) => {
    await prisma.processingJob.update({
      where: { id: redditJobId },
      data: { status: "succeeded", progress: 100, errorCode: null, errorMessage: null },
    });
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ jobId: "reddit-retry", status: "queued" }),
    });
  });
  await page.route(`**/api/agent-runs/${runId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        run: {
          id: runId,
          jobs: platforms.map((platform) => ({
            id: platform === "reddit" ? "reddit-retry" : `seed-${platform}`,
            status: "succeeded",
            progress: 100,
            stage: "complete",
            errorCode: null,
            errorMessage: null,
            messageKey: null,
            input: { contentId: contentByPlatform.get(platform) },
          })),
        },
      }),
    });
  });

  await page.goto("/creator");
  for (const platform of ["TikTok", "Instagram", "X", "Reddit"]) {
    await page.getByRole("checkbox", { name: platform, exact: true }).check();
  }
  await page.getByRole("combobox", { name: "内容语言" }).click();
  await page.getByRole("option", { name: "日语", exact: true }).click();
  await page.getByRole("textbox", { name: "创作简报" }).fill("五个平台的日语创作包");
  await expect(page.getByRole("checkbox", { name: "强化开头钩子" })).toBeVisible();
  await page.getByRole("checkbox", { name: "强化开头钩子" }).check();
  await page.getByRole("checkbox", { name: "风险与合规检查" }).check();

  await page.getByRole("button", { name: "语言: English" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page).toHaveURL(/\/creator$/);
  await expect(page.getByRole("textbox", { name: "Creative brief" })).toHaveValue("五个平台的日语创作包");
  await expect(page.getByRole("combobox", { name: "Content language" })).toContainText("Japanese");
  for (const platform of platforms) {
    await expect(page.getByRole("checkbox", { name: platform === "youtube" ? "YouTube" : platform === "tiktok" ? "TikTok" : platform === "instagram" ? "Instagram" : platform === "x" ? "X" : "Reddit", exact: true })).toBeChecked();
  }

  await page.getByRole("button", { name: "Generate package" }).click();
  for (const platform of platforms.slice(0, 4)) {
    await expect(page.getByTestId(`batch-item-${platform}`).getByRole("button", { name: "Open editor" })).toBeVisible();
  }
  const redditCard = page.getByTestId("batch-item-reddit");
  await expect(redditCard).toContainText("The credential is invalid or expired");
  await expect(redditCard).not.toContainText("provider raw error");
  await redditCard.getByRole("button", { name: "Retry this platform" }).click();
  await expect(redditCard.getByRole("button", { name: "Open editor" })).toBeVisible({ timeout: 15_000 });

  const youtubeCard = page.getByTestId("batch-item-youtube");
  await youtubeCard.getByRole("button", { name: "Open editor" }).click();
  await page.getByLabel("Content Markdown").fill("# YouTube\n\n編集済みの日本語本文");
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(page.getByText("New version saved")).toBeVisible();

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
