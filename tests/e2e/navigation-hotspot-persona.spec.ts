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

const trendPayload = {
  ...hotspotPayload,
  topics: [{
    id: "trend-e2e",
    title: "AI 助手进入真实工作流",
    category: "科技与AI",
    platform: "微博",
    heat: 76,
    change: 90,
    status: "爆发中",
    predictedPeak: 80,
    peakEta: "持续 2 天",
    notes: 2,
    engagement: "12万",
    creators: "2 个平台 / 2 个后端",
    related: 2,
    trend: [40, 80, 76],
    trendEvidence: trendEvidence("24h", 24, 90, 23, "爆发中", [40, 80, 76]),
    trendWindows: {
      "1h": trendEvidence("1h", 1, -5, -2, "回落", [80, 80, 76]),
      "24h": trendEvidence("24h", 24, 90, 23, "爆发中", [40, 80, 76]),
      "7d": trendEvidence("7d", 168, 90, 23, "爆发中", [40, 80, 76]),
    },
    platformShare: [{ label: "微博", value: 60, color: "#b91c1c" }, { label: "知乎", value: 40, color: "#2563eb" }],
    angles: [{ title: "事实梳理 + 时间线", description: "只根据已确认来源梳理变化。", heat: 72, status: "上升" }],
    riskNotes: ["发布前复核来源。"],
    keywords: ["AI 助手", "工作流"],
    sources: [{ id: "source-1", title: "AI 助手进入真实工作流", url: "https://example.com/trend", score: 100, rawScore: "100", desc: "", platform: "微博", platformCode: "weibo", rank: 3, backend: "e2e" }],
  }],
  summary: { ...hotspotPayload.summary, totalItems: 1, activeSources: 1 },
};

function trendEvidence(window: "1h" | "24h" | "7d", windowHours: number, heatChangePercent: number, rankChange: number, status: string, points: number[]) {
  return {
    dataState: "observed",
    window,
    windowHours,
    observationCount: points.length,
    firstObservedAt: "2026-07-18T12:00:00.000Z",
    lastObservedAt: "2026-07-20T12:00:00.000Z",
    heatChangePercent,
    rankChange,
    observedPeak: 80,
    isNew: false,
    durationLabel: "持续 2 天",
    status,
    points,
  };
}

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
  await expect.poll(async () => page.evaluate(() => Boolean(sessionStorage.getItem("startrace:hotspots:v2")))).toBe(true);

  await page.goto("/hotspots?visit=2", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("当前筛选没有热点")).toBeVisible({ timeout: 30_000 });
  expect(hotspotRequests).toBe(1);

  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect.poll(() => hotspotRequests).toBe(2);
});

test("热点时间窗口展示真实观测变化", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.route("**/api/hotspots*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(trendPayload) });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/hotspots");

  await expect(page.getByRole("heading", { level: 1, name: "热点研究" })).toBeVisible();
  await expect(page.getByText("Unhandled Runtime Error")).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "24小时变化" })).toBeVisible();
  await expect(page.getByRole("table").getByText("+90%", { exact: true })).toBeVisible();
  await expect(page.getByText("变化仅根据星迹保存的历史快照计算。", { exact: false })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("table").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(os.tmpdir(), "startrace-hotspot-history-desktop.png") });

  await page.getByRole("button", { name: "1小时", exact: true }).first().click();
  await expect(page.getByRole("columnheader", { name: "1小时变化" })).toBeVisible();
  await expect(page.getByRole("table").getByText("-5%", { exact: true })).toBeVisible();
  await expect(page.getByText("下降 2 位", { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("article").getByText("-5%", { exact: true })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator("article").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(os.tmpdir(), "startrace-hotspot-history-mobile.png") });
  expect(consoleErrors).toEqual([]);
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
