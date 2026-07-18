import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * C11 指标采集与复盘地基端到端验证。
 *
 * 真实 UI + 真实 API + 真实数据库，全部指标为显式打标的夹具数据：
 * 不调用任何真实社交平台或 AiToEarn。
 * 覆盖：/retrospectives 到期列表 + 模拟数据标注 + 规则候选守卫说明、
 * 未发布记录的显式"暂无真实数据"、/publish 数据表现时间线，
 * 桌面 1440×900 与手机 390×844 截图输出到 docs/baseline-c11/。
 */

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
  const match = envFile.match(/^DATABASE_URL="?([^"\r\n]+)"?/m);
  if (!match) throw new Error(".env 中未找到 DATABASE_URL");
  return match[1];
}

const prisma = new PrismaClient({ datasources: { db: { url: loadDatabaseUrl() } } });
const SHOT_DIR = path.resolve(__dirname, "../../docs/baseline-c11");
const CONTENT_TITLE = "C11 指标复盘夹具作品";
const DAY = 24 * 60 * 60 * 1000;

let devUserId = "";
let contentId = "";
let publishedRecordId = "";
let waitingRecordId = "";

async function cleanupC11Data() {
  await prisma.generatedContent.deleteMany({
    where: { userId: devUserId, title: { startsWith: "C11 指标复盘夹具" } },
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

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: "dev@example.com" },
    update: {},
    create: { email: "dev@example.com", name: "Dev User" },
  });
  devUserId = user.id;
  await cleanupC11Data();

  const content = await prisma.generatedContent.create({
    data: {
      userId: devUserId,
      platform: "douyin",
      contentKind: "douyin_video_script",
      outputType: "douyin_video_script",
      title: CONTENT_TITLE,
      tags: ["测试"],
      status: "saved",
      scoreSnapshot: { total: 70 },
    },
  });
  contentId = content.id;

  const publishedAt = new Date(Date.now() - 8 * DAY);
  // 夹具 1：published-like 状态（8 天前），含打标的模拟指标快照
  const published = await prisma.publishRecord.create({
    data: {
      userId: devUserId,
      contentId,
      platform: "douyin",
      status: "published",
      providerRecordId: "c11-fixture-record-published",
      idempotencyKey: `c11-e2e-published-${Date.now()}`,
      publishedAt,
      providerResponse: { simulated: true, provider: "aitoearn-mock" },
    },
  });
  publishedRecordId = published.id;
  for (const [window, offsetDays, viewCount] of [
    ["d1", 1, 1240],
    ["d3", 3, 2980],
  ] as const) {
    await prisma.metricSnapshot.create({
      data: {
        userId: devUserId,
        publishRecordId: published.id,
        window,
        observedAt: new Date(publishedAt.getTime() + offsetDays * DAY),
        viewCount,
        likeCount: Math.round(viewCount * 0.08),
        collectCount: Math.round(viewCount * 0.03),
        commentCount: Math.round(viewCount * 0.012),
        shareCount: Math.round(viewCount * 0.008),
        rawData: { source: "mock-fixture", simulated: true, provider: "aitoearn-mock" },
      },
    });
  }
  // D+7 快照缺失：时间线必须显式显示"已到期 · 等待任务返回"
  await prisma.retrospective.create({
    data: {
      userId: devUserId,
      contentId,
      publishRecordId: published.id,
      status: "drafted",
      dueAt: new Date(publishedAt.getTime() + 7 * DAY),
      predictedScore: { total: 70 },
      variance: { predictedTotal: 70, outcomeScore: 48, delta: -22, direction: "overestimated" },
      ruleProposal: {
        status: "candidate",
        direction: "overestimated",
        reason: "连续 3 次高估，建议创建新规则版本并回测。",
        requiresBacktest: true,
        requiresUserApproval: true,
      },
    },
  });

  // 夹具 2：submitted（未真实发布），复盘与数据表现都必须显式"暂无真实数据"
  const waiting = await prisma.publishRecord.create({
    data: {
      userId: devUserId,
      contentId,
      platform: "douyin",
      status: "submitted",
      idempotencyKey: `c11-e2e-waiting-${Date.now()}`,
    },
  });
  waitingRecordId = waiting.id;
  await prisma.retrospective.create({
    data: {
      userId: devUserId,
      contentId,
      publishRecordId: waiting.id,
      status: "pending",
      dueAt: new Date(Date.now() - DAY),
      predictedScore: { total: 70 },
    },
  });
});

test.afterAll(async () => {
  await cleanupC11Data();
  await prisma.$disconnect();
});

test("retrospectives page shows due items with mock labels, rule guard and explicit waiting state", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/retrospectives");

  // 到期复盘（drafted，含模拟指标）
  await expect(page.getByText(CONTENT_TITLE).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("retrospective-mock-note").first()).toContainText("模拟");
  await expect(page.getByTestId("metric-mock-badge").first()).toBeVisible();
  // 规则候选守卫：只是建议，必须回测并由人确认
  await expect(page.getByText("评分规则候选调整")).toBeVisible();
  await expect(page.getByText("回测优于旧规则，并再次确认启用", { exact: false })).toBeVisible();
  await expect(page.getByText("规则不会自动进化")).toBeVisible();
  // 未真实发布的记录：显式等待文案，绝无伪造指标
  await expect(page.getByTestId("retrospective-no-metrics")).toContainText("尚未真实发布");
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "retrospectives-due-desktop.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("retrospectives page stays usable at 390x844 without horizontal overflow", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/retrospectives");
  await expect(page.getByText(CONTENT_TITLE).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("retrospective-mock-note").first()).toBeVisible();
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "retrospectives-due-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("performance API returns labeled timeline and explicit unavailable reasons", async ({ request }) => {
  const response = await request.get(`/api/content/${contentId}/performance`);
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    performance: {
      records: Array<{
        id: string;
        simulated: boolean;
        availability: { available: boolean; reason?: string; message?: string };
        timeline: Array<{ window: string; status: string; snapshot: { dataSource: string } | null }>;
      }>;
    };
  };
  const published = body.performance.records.find((record) => record.id === publishedRecordId)!;
  expect(published.availability.available).toBe(true);
  expect(published.simulated).toBe(true);
  expect(published.timeline.find((entry) => entry.window === "d1")!.snapshot!.dataSource).toBe("mock-fixture");
  expect(published.timeline.find((entry) => entry.window === "d7")!.status).toBe("due");

  const waiting = body.performance.records.find((record) => record.id === waitingRecordId)!;
  expect(waiting.availability).toMatchObject({ available: false, reason: "provider_processing" });
  expect(waiting.timeline).toEqual([]);
});

test("publish page performance panel shows the mock timeline and the unavailable state", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/publish");

  const publishedCard = page.getByTestId(`publish-record-${publishedRecordId}`);
  await expect(publishedCard).toBeVisible({ timeout: 30_000 });
  await publishedCard.getByTestId(`performance-toggle-${publishedRecordId}`).click();
  await expect(publishedCard.getByTestId("performance-simulated-note")).toContainText("夹具数据");
  await expect(publishedCard.getByTestId("metric-timeline")).toBeVisible();
  await expect(publishedCard.getByTestId("metric-window-d1").getByTestId("metric-mock-badge")).toBeVisible();
  await expect(publishedCard.getByTestId("metric-window-d7")).toContainText("等待任务返回");

  const waitingCard = page.getByTestId(`publish-record-${waitingRecordId}`);
  await waitingCard.getByTestId(`performance-toggle-${waitingRecordId}`).click();
  await expect(waitingCard.getByTestId("performance-unavailable")).toContainText("暂无真实指标数据");
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "publish-performance-desktop.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await assertNoHorizontalOverflow(page);
  await page.screenshot({ path: path.join(SHOT_DIR, "publish-performance-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
});
