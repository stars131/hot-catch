import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { fixtureChecksum } from "./helpers/checksum";

/**
 * 出站闸门与参考重合的端到端验证。
 *
 * 真实 UI + 真实 API + 真实数据库,不调用任何供应商:
 * 草稿第 1 页残留模板变量,正文照搬参考原文 →
 * 发布清单「有阻塞」,指出具体页面并禁止发起 →
 * 参考原文重合给出提醒与片段 →
 * 在编辑器中改掉占位符后清单实时解除阻塞 →
 * 手机 390×844 同样可读,无横向溢出。
 * 截图输出到 docs/baseline-outbound-guard/。
 */

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
  const match = envFile.match(/^DATABASE_URL="?([^"\r\n]+)"?/m);
  if (!match) throw new Error(".env 中未找到 DATABASE_URL");
  return match[1];
}

const prisma = new PrismaClient({ datasources: { db: { url: loadDatabaseUrl() } } });
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SHOT_DIR = path.resolve(__dirname, "../../docs/baseline-outbound-guard");
mkdirSync(SHOT_DIR, { recursive: true });

const TITLE = "复盘这件事，我只留了一个办法";
const COPIED =
  "第一步每天记录三件事大概花五分钟。第二步每周日花三十分钟归纳，把重复出现的问题挑出来。";
const BODY = `${COPIED}后来我发现，真正有用的是只盯住一个问题。`;
const PLACEHOLDER_PAGE = "适合 {{audience}} 的复盘节奏";

const seeded: { contentIds: string[]; conversationIds: string[]; userId: string } = {
  contentIds: [],
  conversationIds: [],
  userId: "",
};

async function seed(tag: string) {
  const user = await prisma.user.upsert({
    where: { email: "dev@example.com" },
    update: {},
    create: { email: "dev@example.com", name: "Dev User" },
  });
  seeded.userId = user.id;
  const conversation = await prisma.conversation.create({
    data: { userId: user.id, title: `出站闸门 ${tag} ${runId}` },
  });
  const structured = {
    title: TITLE,
    pages: [
      { pageNumber: 1, heading: "开场", body: PLACEHOLDER_PAGE },
      { pageNumber: 2, heading: "方法", body: "睡前写下卡住的地方，周末排序，只解决最常出现的那个。" },
    ],
    bodyText: BODY,
    tags: ["复盘", "效率", "成长"],
    interactionEnding: "你最近一次复盘卡在哪一步？",
  };
  const content = await prisma.generatedContent.create({
    data: {
      userId: user.id,
      conversationId: conversation.id,
      platform: "xiaohongshu",
      contentKind: "xhs_graphic",
      outputType: "xhs_graphic",
      title: TITLE,
      bodyText: BODY,
      status: "saved",
      tags: structured.tags,
    },
  });
  const revision = await prisma.contentRevision.create({
    data: {
      userId: user.id,
      contentId: content.id,
      revisionNumber: 1,
      source: "generated",
      title: TITLE,
      bodyText: BODY,
      structuredContent: structured,
      fullMarkdown: `# ${TITLE}\n\n${BODY}`,
      checksum: fixtureChecksum(`seed-guard-${tag}-${runId}`),
    },
  });
  await prisma.contentReference.create({
    data: {
      userId: user.id,
      contentId: content.id,
      role: "structure",
      sourceUrl: "https://www.xiaohongshu.com/explore/65f0000000000000000abc01",
      fingerprint: `guard-${tag}-${runId}`,
      snapshot: {
        version: 1,
        source: { platform: "xiaohongshu", sourceUrl: null, author: "脱敏测试作者", title: "三个月坚持复盘的真实变化" },
        summary: COPIED,
        structure: [],
        opening: "",
        corePoints: [],
        emotionAndPacing: "",
        facts: [],
        boundaries: [],
      },
    },
  });
  const cardId = `card-guard-${tag}-${runId}`;
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: `原创稿已生成:「${TITLE}」(v1)。`,
      status: "complete",
      clientMessageId: `artifact:guard-${tag}-${runId}`,
      metadata: {
        protocol: "star-chat/v1",
        cards: [
          {
            id: cardId,
            version: 1,
            type: "artifact",
            contentId: content.id,
            revisionId: revision.id,
            revisionNumber: 1,
            platform: "xiaohongshu",
            contentKind: "xhs_graphic",
            title: TITLE,
            preview: BODY.slice(0, 60),
            actions: [
              { actionId: "artifact.open", label: "打开编辑", appearance: "primary", repeatable: true },
              { actionId: "publish.prepare", label: "准备发布", repeatable: true },
            ],
          },
        ],
      },
    },
  });
  seeded.contentIds.push(content.id);
  seeded.conversationIds.push(conversation.id);
  return { conversationId: conversation.id, cardId };
}

test.afterAll(async () => {
  if (seeded.contentIds.length) {
    await prisma.generatedContent.deleteMany({ where: { id: { in: seeded.contentIds }, userId: seeded.userId } });
  }
  if (seeded.conversationIds.length) {
    await prisma.conversation.deleteMany({ where: { id: { in: seeded.conversationIds }, userId: seeded.userId } });
  }
  await prisma.$disconnect();
});

async function openChecklist(page: Page, conversationId: string, cardId: string) {
  await page.goto(`/creator/xiaohongshu?conversationId=${conversationId}`);
  const card = page.getByTestId(`card-artifact-${cardId}`);
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.getByTestId("artifact-action-artifact.open").click();
  const panel = page.getByTestId("artifact-panel");
  await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v1/, { timeout: 20000 });
  await panel.getByTestId("artifact-prepare-publish").click();
  const checklist = page.getByTestId("publish-checklist");
  await expect(checklist).toBeVisible();
  return { panel, checklist };
}

async function assertNoHorizontalOverflow(page: Page, width: number) {
  const scrollWidth = await page.evaluate(() => document.scrollingElement?.scrollWidth ?? 0);
  expect(scrollWidth).toBeLessThanOrEqual(width);
}

test.describe("出站闸门(桌面 1440×900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("模板残留阻塞并定位;参考重合提醒;修改后实时解除", async ({ page }) => {
    test.setTimeout(240000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const { conversationId, cardId } = await seed("desktop");
    const { panel, checklist } = await openChecklist(page, conversationId, cardId);

    await expect(checklist.getByTestId("publish-checklist-state")).toHaveText("有阻塞");
    const blocks = checklist.getByTestId("publish-checklist-blocks");
    await expect(blocks).toContainText("公开信息安全");
    await expect(blocks).toContainText("第 1 页正文");
    await expect(blocks).toContainText("{{audience}}");
    const warnings = checklist.getByTestId("publish-checklist-warnings");
    await expect(warnings).toContainText("参考原文重合");
    await expect(warnings).toContainText("每天记录三件事");
    await expect(checklist.getByTestId("publish-checklist-confirm")).toBeDisabled();
    await assertNoHorizontalOverflow(page, 1440);
    await page.screenshot({ path: path.join(SHOT_DIR, "desktop-1440-blocked.png") });

    // 关闭清单,在编辑器里改掉占位符,重新打开:阻塞解除,确认按钮可用
    await checklist.getByTestId("publish-checklist-close").click();
    await panel.getByLabel("第 1 页正文").fill("适合刚开始复盘的人的节奏");
    await panel.getByTestId("artifact-prepare-publish").click();
    const reopened = page.getByTestId("publish-checklist");
    await expect(reopened.getByTestId("publish-checklist-blocks")).toHaveCount(0);
    await expect(reopened.getByTestId("publish-checklist-confirm")).toBeEnabled();
    await expect(reopened.getByTestId("publish-checklist-warnings")).toContainText("参考原文重合");
    await page.screenshot({ path: path.join(SHOT_DIR, "desktop-1440-resolved.png") });

    expect(errors.filter((text) => !text.includes("Download the React DevTools"))).toEqual([]);
  });
});

test.describe("出站闸门(手机 390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("阻塞说明在手机可读,无横向溢出", async ({ page }) => {
    test.setTimeout(240000);
    const { conversationId, cardId } = await seed("mobile");
    const { checklist } = await openChecklist(page, conversationId, cardId);
    await expect(checklist.getByTestId("publish-checklist-state")).toHaveText("有阻塞");
    await expect(checklist.getByTestId("publish-checklist-blocks")).toContainText("第 1 页正文");
    await assertNoHorizontalOverflow(page, 390);
    await page.screenshot({ path: path.join(SHOT_DIR, "mobile-390-blocked.png") });
  });
});
