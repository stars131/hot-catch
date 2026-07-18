import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";

const hotspotPayload = {
  generatedAt: "2026-07-17T00:00:00.000Z",
  platforms: ["全平台"],
  topics: [],
  sourceHealth: [],
  sourceCatalog: [],
  projectReferences: [],
  summary: {
    totalItems: 0,
    activeSources: 0,
    crossPlatformTopics: 0,
    backendCount: 0,
    credentialFreeSourceCount: 0,
    optionalConnectionSourceCount: 0,
    cookieSourceCount: 0,
    cookieConfiguredCount: 0,
    projectReferenceCount: 0,
    source: "e2e",
  },
};

test("创作页只保留一层主导航", async ({ page }) => {
  await page.goto("/creator/xiaohongshu");
  await expect(page.getByRole("heading", { level: 1, name: "小红书创作" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主导航" })).toHaveCount(1);
  await expect(page.getByTestId("conversation-list")).toBeVisible();
  await page.screenshot({ path: path.join(os.tmpdir(), "startrace-creator-navigation.png") });
});

test("热点结果在当前浏览器会话复用，手动刷新才重新请求", async ({ page }) => {
  let hotspotRequests = 0;
  await page.route("**/api/hotspots*", async (route) => {
    hotspotRequests += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(hotspotPayload) });
  });

  await page.goto("/hotspots");
  await expect(page.getByText("当前筛选没有热点")).toBeVisible();
  expect(hotspotRequests).toBe(1);
  await expect.poll(async () => page.evaluate(() => Boolean(sessionStorage.getItem("startrace:hotspots:v1")))).toBe(true);

  await page.goto("/hotspots?visit=2", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("当前筛选没有热点")).toBeVisible({ timeout: 30_000 });
  expect(hotspotRequests).toBe(1);

  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect.poll(() => hotspotRequests).toBe(2);
});

test("人设创建和修改使用逐步问答", async ({ page }) => {
  await page.goto("/personas");
  await expect(page.getByRole("heading", { level: 1, name: "账号人设" })).toBeVisible();
  await page.getByRole("button", { name: "对话新建版本" }).click();

  await expect(page.getByRole("dialog").getByText("对话式人设编辑")).toBeVisible();
  const reply = page.getByRole("textbox", { name: "回复人设助手" });
  await reply.fill("测试专业版");
  await page.getByRole("button", { name: "发送并继续" }).click();
  await expect(page.getByText("这个人设对应的账号叫什么？")).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(os.tmpdir(), "startrace-persona-conversation-mobile.png") });
});
