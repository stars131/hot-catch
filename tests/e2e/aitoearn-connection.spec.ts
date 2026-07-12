import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * C9 AiToEarn 连接层端到端验证。
 *
 * 真实 UI + 真实 API + 真实数据库,全程不调用真实 AiToEarn:
 * dev 用户无凭证时,状态接口显式返回 not_configured(200,不抛错),
 * 连接设置页显示「未配置」徽标、显式未配置提示、账号占位与平台规则,
 * 发布中心显示「连接未配置」面板并给出连接 CTA;
 * 桌面 1440×900 与手机 390×844 截图输出到 docs/baseline-c9/。
 */

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
  const match = envFile.match(/^DATABASE_URL="?([^"\r\n]+)"?/m);
  if (!match) throw new Error(".env 中未找到 DATABASE_URL");
  return match[1];
}

const prisma = new PrismaClient({
  datasources: { db: { url: loadDatabaseUrl() } },
});

const SHOT_DIR = path.resolve(__dirname, "../../docs/baseline-c9");

async function ensureDevUserWithoutAiToEarn() {
  const user = await prisma.user.upsert({
    where: { email: "dev@example.com" },
    update: {},
    create: { email: "dev@example.com", name: "Dev User" },
  });
  await prisma.providerCredential.deleteMany({
    where: { userId: user.id, provider: "aitoearn" },
  });
  return user.id;
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.beforeAll(async () => {
  await ensureDevUserWithoutAiToEarn();
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("status API returns explicit not_configured without leaking secrets", async ({ request }) => {
  const response = await request.get("/api/integrations/aitoearn/status");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.connection).toBe("not_configured");
  expect(body.keyHint).toBeNull();
  expect(body.metadata.platforms).toHaveLength(2);
  expect(JSON.stringify(body).toLowerCase()).not.toContain("apikey");
});

test("connections page shows explicit not-configured state and account placeholder", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings/connections");
  await expect(page.getByTestId("aitoearn-connection-badge")).toHaveText("未配置");
  await expect(page.getByTestId("aitoearn-not-configured")).toContainText("尚未保存 AiToEarn API Key");
  await expect(page.getByTestId("aitoearn-accounts")).toContainText("完成连接后可在这里查看授权账号");
  await expect(page.getByRole("button", { name: "授权小红书" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "同步账号状态" })).toBeDisabled();
  await expect(page.getByText("平台发布规则")).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "connections-not-configured-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings/connections");
  await expect(page.getByTestId("aitoearn-connection-badge")).toHaveText("未配置");
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "connections-not-configured-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("publish page distinguishes the not-configured connection state", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/publish");
  const contentSelect = page.locator("select").first();
  const emptyState = page.getByText("还没有可发布版本");
  await expect(contentSelect.or(emptyState)).toBeVisible({ timeout: 30_000 });
  if (await contentSelect.isVisible()) {
    await expect(page.getByTestId("publish-connection-required")).toContainText("连接未配置");
    await expect(page.getByRole("link", { name: "前往连接设置" })).toBeVisible();
  } else {
    await expect(emptyState).toBeVisible();
  }
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "publish-connection-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/publish");
  await expect(contentSelect.or(emptyState)).toBeVisible({ timeout: 30_000 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "publish-connection-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});
