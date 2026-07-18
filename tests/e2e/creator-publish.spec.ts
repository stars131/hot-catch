import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { fixtureChecksum } from "./helpers/checksum";

/**
 * C8 发布确认与移交端到端验证。
 *
 * 真实 UI + 真实 API + 真实数据库,全程不调用 AiToEarn(dev 用户无凭证,
 * 连接状态确定为「未配置」,发布中心账号加载失败进入显式连接提示):
 * Artifact「准备发布」 → 发布就绪清单(通过/提醒/阻塞) →
 * 在对话中发起确认 → 就绪卡 → 二次点击确认移交 → 不创建 PublishRecord →
 * 「打开发布中心」 → /publish 预选 + 移交横幅 + 连接未就绪状态 →
 * 刷新后确认状态保持 → 阻塞内容禁止发起 → 手机 390×844 可用性。
 * 截图输出到 docs/baseline-c8/。
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

const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const SHOT_DIR = path.resolve(__dirname, "../../docs/baseline-c8");
let userId = "";

const XHS_TITLE = "AI 面试复盘三步法";
const XHS_BODY =
  "面试完不复盘,同样的问题会再犯一遍。这篇讲清楚复盘的三个步骤:记录、归因、演练。".repeat(2);

const XHS_STRUCTURED = {
  title: XHS_TITLE,
  pages: [
    { pageNumber: 1, heading: "开场", body: "第一页:为什么要复盘面试。" },
    { pageNumber: 2, heading: "方法", body: "第二页:复盘的三个步骤。" },
  ],
  bodyText: XHS_BODY,
  tags: ["求职", "复盘", "面试"],
  interactionEnding: "你最近一次面试卡在哪一步?",
};

function artifactCardMetadata(params: {
  cardId: string;
  contentId: string;
  revisionId: string;
}) {
  return {
    protocol: "star-chat/v1",
    cards: [
      {
        id: params.cardId,
        version: 1,
        type: "artifact",
        contentId: params.contentId,
        revisionId: params.revisionId,
        revisionNumber: 1,
        platform: "xiaohongshu",
        contentKind: "xhs_graphic",
        title: XHS_TITLE,
        preview: XHS_BODY.slice(0, 60),
        actions: [
          { actionId: "artifact.open", label: "打开编辑", appearance: "primary", repeatable: true },
          { actionId: "artifact.refine", label: "继续优化", repeatable: true },
          { actionId: "publish.prepare", label: "准备发布", repeatable: true },
        ],
      },
    ],
  };
}

/** 每个用例独立种子;blocked=true 时留空标题制造阻塞项。 */
async function seedConversation(tag: string, options?: { blocked?: boolean }) {
  const user = await prisma.user.upsert({
    where: { email: "dev@example.com" },
    update: {},
    create: { email: "dev@example.com", name: "Dev User" },
  });
  userId = user.id;
  const conversation = await prisma.conversation.create({
    data: { userId, title: `C8 发布测试 ${tag} ${runId}` },
  });
  const blocked = options?.blocked ?? false;
  const content = await prisma.generatedContent.create({
    data: {
      userId,
      conversationId: conversation.id,
      platform: "xiaohongshu",
      contentKind: "xhs_graphic",
      outputType: "xhs_graphic",
      title: blocked ? null : XHS_TITLE,
      bodyText: blocked ? null : XHS_BODY,
      status: "saved",
      tags: XHS_STRUCTURED.tags,
    },
  });
  const revision = await prisma.contentRevision.create({
    data: {
      userId,
      contentId: content.id,
      revisionNumber: 1,
      source: "generated",
      title: blocked ? "" : XHS_TITLE,
      bodyText: blocked ? "" : XHS_BODY,
      structuredContent: blocked
        ? { ...XHS_STRUCTURED, title: "", bodyText: "", pages: [], tags: [] }
        : XHS_STRUCTURED,
      fullMarkdown: blocked ? "" : `# ${XHS_TITLE}\n\n${XHS_BODY}`,
      checksum: fixtureChecksum(`seed-c8-${tag}-${runId}`),
    },
  });
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: `原创稿已生成:「${XHS_TITLE}」(v1)。`,
      status: "complete",
      clientMessageId: `artifact:c8-${tag}-${runId}`,
      metadata: artifactCardMetadata({
        cardId: `card-c8-${tag}-${runId}`,
        contentId: content.id,
        revisionId: revision.id,
      }),
    },
  });
  return { conversationId: conversation.id, contentId: content.id };
}

const seededContentIds: string[] = [];
const seededConversationIds: string[] = [];

test.afterAll(async () => {
  // 只清理本轮种子;不触碰 dev 用户、凭证与其他数据
  if (seededContentIds.length) {
    await prisma.generatedContent.deleteMany({
      where: { id: { in: seededContentIds }, userId },
    });
  }
  if (seededConversationIds.length) {
    await prisma.conversation.deleteMany({
      where: { id: { in: seededConversationIds }, userId },
    });
  }
  await prisma.$disconnect();
});

async function assertNoHorizontalOverflow(page: Page, width: number) {
  const scrollWidth = await page.evaluate(
    () => document.scrollingElement?.scrollWidth ?? 0,
  );
  expect(scrollWidth).toBeLessThanOrEqual(width);
}

async function openArtifact(page: Page, cardId: string) {
  const card = page.getByTestId(`card-artifact-${cardId}`);
  await expect(card).toBeVisible({ timeout: 20000 });
  await card.getByTestId("artifact-action-artifact.open").click();
  const panel = page.getByTestId("artifact-panel");
  await expect(panel).toBeVisible();
  return panel;
}

test.describe("C8 发布确认(桌面 1440×900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("清单 → 对话就绪卡 → 二次确认移交 → 发布中心预选与连接未就绪", async ({ page }) => {
    test.setTimeout(300000);
    const seed = await seedConversation("main");
    seededContentIds.push(seed.contentId);
    seededConversationIds.push(seed.conversationId);

    await page.goto(`/creator/xiaohongshu?conversationId=${seed.conversationId}`);
    const panel = await openArtifact(page, `card-c8-main-${runId}`);
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v1/, {
      timeout: 15000,
    });

    // 1. 工具栏「准备发布」→ 清单:内容项通过,凭证缺失显式提示 + 连接入口
    await panel.getByTestId("artifact-prepare-publish").click();
    const checklist = page.getByTestId("publish-checklist");
    await expect(checklist).toBeVisible();
    await expect(checklist.getByTestId("publish-checklist-state")).toHaveText("已就绪");
    const connection = checklist.getByTestId("publish-checklist-connection");
    await expect(connection).toHaveAttribute("data-connection", "missing", {
      timeout: 15000,
    });
    await expect(connection).toContainText("尚未配置 AiToEarn 凭证");
    await expect(checklist.getByTestId("publish-checklist-connect")).toBeVisible();
    await checklist.getByTestId("publish-checklist-pass-toggle").click();
    await expect(checklist).toContainText("分页结构");
    await assertNoHorizontalOverflow(page, 1440);
    await page.screenshot({ path: path.join(SHOT_DIR, "desktop-1440-checklist.png") });

    // 2. Esc 只关闭清单,面板仍在;再次打开
    await checklist.getByTestId("publish-checklist-confirm").focus();
    await page.keyboard.press("Escape");
    await expect(checklist).toBeHidden();
    await expect(panel).toBeVisible();
    await panel.getByTestId("artifact-prepare-publish").click();
    await expect(page.getByTestId("publish-checklist")).toBeVisible();

    // 3. 在对话中发起发布确认 → 就绪卡(凭证缺失 → 有提醒 + 连接动作)
    await page.getByTestId("publish-checklist-confirm").click();
    const readyCard = page.locator('[data-testid^="card-publish-ready-"]').first();
    await expect(readyCard).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("publish-checklist")).toBeHidden();
    await expect(readyCard).toHaveAttribute("data-publish-state", "warnings");
    await expect(readyCard).toContainText("供应商连接:未配置");
    await expect(readyCard).toContainText("尚未配置 AiToEarn 凭证");
    await expect(
      readyCard.getByTestId("publish-action-connection.open"),
    ).toBeVisible();
    await page.screenshot({ path: path.join(SHOT_DIR, "desktop-1440-readiness-card.png") });

    // 4. 二次点击确认 → 移交结果:明确说明不会自动发布;不创建 PublishRecord
    const confirm = readyCard.getByTestId("publish-action-publish.confirm_handoff");
    await confirm.click();
    await expect(confirm).toHaveText(/再次点击确认/);
    await confirm.click();
    await expect(page.getByText(/已确认把「AI 面试复盘三步法」v1 移交到发布中心/)).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText("已移交发布中心(待你手动发布)")).toBeVisible();
    await expect(readyCard.getByTestId("publish-ready-confirmed")).toBeVisible();
    const recordCount = await prisma.publishRecord.count({
      where: { contentId: seed.contentId },
    });
    expect(recordCount).toBe(0);
    await page.screenshot({ path: path.join(SHOT_DIR, "desktop-1440-handoff-confirmed.png") });

    // 5. 刷新后确认状态与结果消息都从数据库恢复,重复确认入口消失
    await page.reload();
    const restoredCard = page.locator('[data-testid^="card-publish-ready-"]').first();
    await expect(restoredCard).toBeVisible({ timeout: 20000 });
    await expect(restoredCard.getByTestId("publish-ready-confirmed")).toBeVisible();
    await expect(
      restoredCard.getByTestId("publish-action-publish.confirm_handoff"),
    ).toBeHidden();
    await expect(page.getByText("已移交发布中心(待你手动发布)")).toBeVisible();

    // 6. 打开发布中心 → 预选移交内容 + 移交横幅 + 连接未就绪显式状态(不假造账号)
    await page.getByRole("button", { name: "打开发布中心" }).click();
    await expect(page).toHaveURL(new RegExp(`/publish\\?contentId=${seed.contentId}&from=creator`));
    await expect(page.getByTestId("publish-handoff-banner")).toBeVisible({ timeout: 30000 });
    const contentSelect = page.locator("select").first();
    await expect(contentSelect).toHaveValue(seed.contentId, { timeout: 30000 });
    await expect(page.getByTestId("publish-connection-required")).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByTestId("publish-connection-required")).toContainText(
      "连接未配置",
    );
    await assertNoHorizontalOverflow(page, 1440);
    await page.screenshot({ path: path.join(SHOT_DIR, "desktop-1440-publish-handoff.png") });
  });

  test("阻塞内容:清单显示阻塞项并禁止发起;就绪卡不提供确认动作", async ({ page }) => {
    test.setTimeout(240000);
    const seed = await seedConversation("blocked", { blocked: true });
    seededContentIds.push(seed.contentId);
    seededConversationIds.push(seed.conversationId);

    await page.goto(`/creator/xiaohongshu?conversationId=${seed.conversationId}`);
    const panel = await openArtifact(page, `card-c8-blocked-${runId}`);
    await panel.getByTestId("artifact-prepare-publish").click();
    const checklist = page.getByTestId("publish-checklist");
    await expect(checklist).toBeVisible();
    await expect(checklist.getByTestId("publish-checklist-state")).toHaveText("有阻塞");
    await expect(checklist.getByTestId("publish-checklist-blocks")).toContainText("标题为空");
    await expect(checklist.getByTestId("publish-checklist-confirm")).toBeDisabled();
    await expect(checklist.getByTestId("publish-checklist-hint")).toContainText("阻塞项");
    await page.screenshot({ path: path.join(SHOT_DIR, "desktop-1440-checklist-blocked.png") });

    // 纯文本发布意图也走服务端评估:阻塞卡上没有「确认并移交」动作
    await page.getByTestId("publish-checklist-close").click();
    const composer = page.getByLabel("创作输入框");
    await composer.fill("准备发布");
    await composer.press("Enter");
    const readyCard = page.locator('[data-testid^="card-publish-ready-"]').first();
    await expect(readyCard).toBeVisible({ timeout: 30000 });
    await expect(readyCard).toHaveAttribute("data-publish-state", "blocked");
    await expect(
      readyCard.getByTestId("publish-action-publish.confirm_handoff"),
    ).toBeHidden();
    await expect(readyCard.getByTestId("publish-action-publish.copy_missing")).toBeVisible();

    // 复制待处理项 → 预填修改指令
    await readyCard.getByTestId("publish-action-publish.copy_missing").click();
    await expect(composer).toHaveValue(/\[阻塞\] 标题/);
  });
});

test.describe("C8 发布确认(手机 390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("清单与就绪卡在手机可用,确认后回到对话,无横向溢出", async ({ page }) => {
    test.setTimeout(300000);
    const seed = await seedConversation("mobile");
    seededContentIds.push(seed.contentId);
    seededConversationIds.push(seed.conversationId);

    await page.goto(`/creator/xiaohongshu?conversationId=${seed.conversationId}`);
    const panel = await openArtifact(page, `card-c8-mobile-${runId}`);
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v1/, {
      timeout: 15000,
    });

    // 清单全屏可用,连接提示完整可见
    await panel.getByTestId("artifact-prepare-publish").click();
    const checklist = page.getByTestId("publish-checklist");
    await expect(checklist).toBeVisible();
    await expect(checklist.getByTestId("publish-checklist-connection")).toHaveAttribute(
      "data-connection",
      "missing",
      { timeout: 15000 },
    );
    await assertNoHorizontalOverflow(page, 390);
    await page.screenshot({ path: path.join(SHOT_DIR, "mobile-390-checklist.png") });

    // 发起确认:手机上面板收起,回到对话看到就绪卡;主操作不被遮挡
    await checklist.getByTestId("publish-checklist-confirm").click();
    const readyCard = page.locator('[data-testid^="card-publish-ready-"]').first();
    await expect(readyCard).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("artifact-panel")).toBeHidden();
    await assertNoHorizontalOverflow(page, 390);
    await page.screenshot({ path: path.join(SHOT_DIR, "mobile-390-readiness-card.png") });

    // 二次确认移交 → 结果通知;不创建发布记录
    const confirm = readyCard.getByTestId("publish-action-publish.confirm_handoff");
    await confirm.scrollIntoViewIfNeeded();
    await confirm.click();
    await expect(confirm).toHaveText(/再次点击确认/);
    await confirm.click();
    await expect(page.getByText("已移交发布中心(待你手动发布)")).toBeVisible({
      timeout: 30000,
    });
    expect(
      await prisma.publishRecord.count({ where: { contentId: seed.contentId } }),
    ).toBe(0);

    // 打开发布中心:预选 + 横幅 + 连接未就绪,无横向溢出
    await page.getByRole("button", { name: "打开发布中心" }).click();
    await expect(page.getByTestId("publish-handoff-banner")).toBeVisible({ timeout: 30000 });
    await expect(page.locator("select").first()).toHaveValue(seed.contentId, {
      timeout: 30000,
    });
    await expect(page.getByTestId("publish-connection-required")).toBeVisible({
      timeout: 20000,
    });
    await assertNoHorizontalOverflow(page, 390);
    await page.screenshot({ path: path.join(SHOT_DIR, "mobile-390-publish-handoff.png") });
  });
});
