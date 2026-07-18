import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { fixtureChecksum } from "./helpers/checksum";

/**
 * C10 本地发布执行状态机端到端验证。
 *
 * 真实 UI + 真实 API + 真实数据库，PUBLISH_PROVIDER_MODE=mock：
 * 全程不调用真实 AiToEarn、不上传真实素材、不声称真实发布成功。
 * 覆盖：无凭证 connection_required、模拟模式横幅、创建→submitted→awaiting_user
 * 短链（契约夹具）、失败→重试恢复、取消、API 幂等防重，
 * 桌面 1440×900 与手机 390×844 截图输出到 docs/baseline-c10/。
 */

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
  const match = envFile.match(/^DATABASE_URL="?([^"\r\n]+)"?/m);
  if (!match) throw new Error(".env 中未找到 DATABASE_URL");
  return match[1];
}

const prisma = new PrismaClient({ datasources: { db: { url: loadDatabaseUrl() } } });
const SHOT_DIR = path.resolve(__dirname, "../../docs/baseline-c10");
const CONTENT_TITLE = "C10 模拟发布抖音脚本";
const FIXTURE_SHORT_LINK = "https://v.douyin.com/fixture/";
const VIDEO_FILE = {
  name: "c10-demo.mp4",
  mimeType: "video/mp4",
  buffer: Buffer.alloc(2048, 1),
};

let devUserId = "";
let contentId = "";

async function cleanupC10Data() {
  await prisma.generatedContent.deleteMany({
    where: { userId: devUserId, title: { startsWith: "C10 模拟发布" } },
  });
  await prisma.providerCredential.deleteMany({
    where: { userId: devUserId, provider: "aitoearn" },
  });
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

/** 在发布页完成一次模拟提交，返回本地发布记录 ID。 */
async function submitMockPublish(page: Page, accountId: string) {
  await page.goto("/publish");
  await expect(page.getByTestId("publish-mock-banner")).toBeVisible();
  const contentSelect = page.locator("select").first();
  await expect(contentSelect).toBeVisible({ timeout: 30_000 });
  await contentSelect.selectOption(contentId);
  await page.locator("select").nth(1).selectOption(accountId);
  await page.locator('input[type="file"]').setInputFiles(VIDEO_FILE);
  await expect(page.getByText(VIDEO_FILE.name, { exact: false })).toBeVisible({ timeout: 15_000 });
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/publish/flows") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "确认并发布" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(202);
  const body = (await response.json()) as { recordId: string; providerMode: string };
  expect(body.providerMode).toBe("mock");
  return body.recordId;
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: "dev@example.com" },
    update: {},
    create: { email: "dev@example.com", name: "Dev User" },
  });
  devUserId = user.id;
  await cleanupC10Data();
  const content = await prisma.generatedContent.create({
    data: {
      userId: devUserId,
      platform: "douyin",
      contentKind: "douyin_video_script",
      outputType: "douyin_video_script",
      title: CONTENT_TITLE,
      tags: ["测试"],
      status: "saved",
    },
  });
  contentId = content.id;
  await prisma.contentRevision.create({
    data: {
      userId: devUserId,
      contentId,
      revisionNumber: 1,
      source: "manual",
      title: CONTENT_TITLE,
      bodyText: "C10 本地发布状态机演示文案。",
      structuredContent: { shots: [] },
      checksum: fixtureChecksum(`c10-e2e-${Date.now()}`),
    },
  });
});

test.afterAll(async () => {
  // 恢复无凭证基线（C8/C9 spec 依赖），并清理本批测试数据
  await cleanupC10Data();
  await prisma.$disconnect();
});

test("without a credential the publish flow returns explicit connection_required", async ({ page, request }) => {
  const errors = collectPageErrors(page);
  const response = await request.post("/api/publish/flows", {
    data: {
      contentId,
      accountId: "mock-douyin-active",
      assets: [{ url: "https://assets.example/video.mp4", type: "video" }],
    },
  });
  expect(response.status()).toBe(422);
  const body = await response.json();
  expect(body.error.code).toBe("CREDENTIAL_NOT_CONFIGURED");
  expect(body.error.details).toMatchObject({
    reason: "connection_required",
    connection: "not_configured",
  });
  // 无凭证时不创建悬空发布记录
  expect(await prisma.publishRecord.count({ where: { contentId } })).toBe(0);

  const signResponse = await request.post("/api/publish/assets/sign", {
    data: { fileName: "demo.mp4", contentType: "video/mp4", size: 1024 },
  });
  expect(signResponse.status()).toBe(422);
  expect((await signResponse.json()).error.details.reason).toBe("connection_required");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/publish");
  await expect(page.getByTestId("publish-connection-required")).toBeVisible({ timeout: 30_000 });
  // 模拟模式是环境级事实：与"连接未配置"面板并存显示
  await expect(page.getByTestId("publish-mock-banner")).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "publish-connection-required-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/publish");
  await expect(page.getByTestId("publish-connection-required")).toBeVisible({ timeout: 30_000 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "publish-connection-required-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("after saving a fixture credential the workspace enters explicit mock mode", async ({ page, request }) => {
  const errors = collectPageErrors(page);
  const saved = await request.put("/api/settings/credentials", {
    data: { provider: "aitoearn", value: { apiKey: "mock-e2e-fixture-key" } },
  });
  expect(saved.ok()).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/publish");
  await expect(page.getByTestId("publish-mock-banner")).toContainText("本地模拟模式");
  const accountSelect = page.locator("select").nth(1);
  await expect(accountSelect).toBeVisible({ timeout: 30_000 });
  await expect(accountSelect.locator("option", { hasText: "模拟抖音账号" })).toHaveCount(1);
  // 页面绝不出现凭证原文
  expect(await page.content()).not.toContain("mock-e2e-fixture-key");
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "publish-mock-workspace-desktop.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("mock publish runs submitted → awaiting_user with the fixture short link and stays idempotent", async ({ page, request }) => {
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const recordId = await submitMockPublish(page, "mock-douyin-active");

  const card = page.getByTestId(`publish-record-${recordId}`);
  await expect(card).toBeVisible();
  // 2 秒轮询后本地状态机推进到 awaiting_user，短链来自契约夹具
  await expect(card.getByText("等待确认")).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText("还差用户确认")).toBeVisible();
  const shortLinkButton = card.getByRole("link", { name: /打开抖音确认/ });
  await expect(shortLinkButton).toHaveAttribute("href", FIXTURE_SHORT_LINK);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "publish-awaiting-user-desktop.png"), fullPage: true });

  // API 幂等：同一 Idempotency-Key 重放，返回同一记录且不重复提交
  const record = await prisma.publishRecord.findUniqueOrThrow({ where: { id: recordId } });
  const replayPayload = {
    contentId,
    accountId: "mock-douyin-active",
    assets: [{ url: "https://replay.example/video.mp4", type: "video" }],
  };
  const first = await request.post("/api/publish/flows", {
    headers: { "Idempotency-Key": `c10-replay-${record.idempotencyKey.slice(0, 8)}` },
    data: replayPayload,
  });
  const second = await request.post("/api/publish/flows", {
    headers: { "Idempotency-Key": `c10-replay-${record.idempotencyKey.slice(0, 8)}` },
    data: replayPayload,
  });
  const firstBody = await first.json();
  const secondBody = await second.json();
  expect(secondBody.recordId).toBe(firstBody.recordId);
  const attempts = await prisma.publishRecord.findUniqueOrThrow({
    where: { id: firstBody.recordId },
    select: { attemptCount: true },
  });
  expect(attempts.attemptCount).toBe(1);

  // 手机 390×844：状态卡、短链按钮可用且无横向溢出
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/publish");
  const mobileCard = page.getByTestId(`publish-record-${recordId}`);
  await expect(mobileCard.getByText("等待确认")).toBeVisible({ timeout: 30_000 });
  await expect(mobileCard.getByRole("link", { name: /打开抖音确认/ })).toHaveAttribute("href", FIXTURE_SHORT_LINK);
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "publish-awaiting-user-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("a failed mock publish shows the reason and recovers through guarded retry", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const recordId = await submitMockPublish(page, "mock-douyin-fail");

  const card = page.getByTestId(`publish-record-${recordId}`);
  await expect(card.getByText("失败", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText(/发布失败（.+），请检查连接后重试/)).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "publish-failed-desktop.png"), fullPage: true });

  await card.getByRole("button", { name: "重试" }).click();
  await expect(card.getByText("等待确认")).toBeVisible({ timeout: 20_000 });
  await expect(card.getByRole("link", { name: /打开抖音确认/ })).toHaveAttribute("href", FIXTURE_SHORT_LINK);
  await page.screenshot({ path: path.join(SHOT_DIR, "publish-retry-recovered-desktop.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("an in-flight mock publish can be canceled exactly once", async ({ page, request }) => {
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const recordId = await submitMockPublish(page, "mock-douyin-active");

  const card = page.getByTestId(`publish-record-${recordId}`);
  await expect(card.getByText("等待确认")).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: "取消", exact: true }).click();
  await expect(card.getByText("已取消")).toBeVisible({ timeout: 20_000 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "publish-canceled-desktop.png"), fullPage: true });

  // 终态守卫：取消后再取消/重试都被拒绝
  const cancelAgain = await request.post(`/api/publish/records/${recordId}/cancel`);
  expect(cancelAgain.status()).toBe(409);
  const retryFinal = await request.post(`/api/publish/records/${recordId}/retry`);
  expect(retryFinal.status()).toBe(409);
  expect(errors).toEqual([]);
});
