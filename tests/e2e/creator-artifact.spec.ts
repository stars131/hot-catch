import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { fixtureChecksum } from "./helpers/checksum";

/**
 * C5 Artifact 成果块与桌面侧栏端到端验证。
 *
 * 通过数据库种子构造「已生成初稿」的会话(生成本身依赖真实 LLM 凭证,属 C10 验收),
 * 验证的全部是真实 UI + 真实 API + 真实数据库:
 * 卡片 → 面板 → 手动编辑自动保存 → 查看版本不产生新版本 → 恢复按 payload 建版 →
 * 外部生成完成时的冲突选择 / 自动跟随。
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
let conversationId = "";
let contentId = "";
let userId = "";

const SEED_TITLE = "AI 面试复盘图文";
const SEED_BODY = "这是种子初稿正文,用于验证 Artifact 面板的编辑与版本能力。";

function structuredFor(title: string, body: string) {
  return {
    title,
    titleOptions: [title, `${title}(备选)`, `${title}(精简)`],
    coverTextOptions: ["面试复盘", "避坑指南"],
    pages: [
      { pageNumber: 1, heading: "开场", body: "第一页:为什么要复盘面试。", visualSuggestion: "大字标题" },
      { pageNumber: 2, heading: "方法", body: "第二页:三个复盘步骤。", visualSuggestion: "步骤清单" },
    ],
    bodyText: body,
    tags: ["求职", "复盘"],
    interactionEnding: "你最近一次面试卡在哪一步?评论区聊聊。",
    riskNotes: ["不承诺面试结果"],
  };
}

async function insertExternalGeneratedRevision(title: string, body: string) {
  const latest = await prisma.contentRevision.aggregate({
    where: { contentId },
    _max: { revisionNumber: true },
  });
  return prisma.contentRevision.create({
    data: {
      userId,
      contentId,
      revisionNumber: (latest._max.revisionNumber ?? 0) + 1,
      source: "generated",
      title,
      bodyText: body,
      structuredContent: structuredFor(title, body),
      fullMarkdown: `# ${title}\n\n${body}`,
      checksum: fixtureChecksum(`seed-${runId}-${Math.random().toString(36).slice(2)}`),
    },
  });
}

async function assertNoHorizontalOverflow(page: Page, width: number) {
  const scrollWidth = await page.evaluate(
    () => document.scrollingElement?.scrollWidth ?? 0,
  );
  expect(scrollWidth).toBeLessThanOrEqual(width);
}

test.beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: "dev@example.com" },
    update: {},
    create: { email: "dev@example.com", name: "Dev User" },
  });
  userId = user.id;

  const conversation = await prisma.conversation.create({
    data: { userId, title: `C5 Artifact 测试 ${runId}` },
  });
  conversationId = conversation.id;

  const content = await prisma.generatedContent.create({
    data: {
      userId,
      conversationId,
      platform: "xiaohongshu",
      contentKind: "xhs_graphic",
      outputType: "xhs_graphic",
      title: SEED_TITLE,
      bodyText: SEED_BODY,
      status: "saved",
      tags: ["求职", "复盘"],
      interactionEnding: "你最近一次面试卡在哪一步?评论区聊聊。",
      riskNotes: "不承诺面试结果",
      scoreSnapshot: {
        total: 62,
        maxScore: 100,
        dimensions: [
          {
            key: "hook",
            label: "标题与开场",
            score: 8,
            maxScore: 20,
            reasons: ["至少提供 3 个标题候选"],
          },
          {
            key: "structure",
            label: "结构完整",
            score: 14,
            maxScore: 20,
            reasons: ["至少包含 3 页结构"],
          },
          { key: "value", label: "信息价值", score: 25, maxScore: 25, reasons: [] },
          { key: "visual", label: "视觉指令", score: 15, maxScore: 15, reasons: [] },
        ],
        warnings: ["至少提供 3 个标题候选", "至少包含 3 页结构"],
      },
    },
  });
  contentId = content.id;

  const revision = await prisma.contentRevision.create({
    data: {
      userId,
      contentId,
      revisionNumber: 1,
      source: "generated",
      title: SEED_TITLE,
      bodyText: SEED_BODY,
      structuredContent: structuredFor(SEED_TITLE, SEED_BODY),
      fullMarkdown: `# ${SEED_TITLE}\n\n${SEED_BODY}`,
      checksum: fixtureChecksum(`seed-${runId}-v1`),
    },
  });

  await prisma.contentReference.create({
    data: {
      userId,
      contentId,
      role: "structure",
      sourceUrl: "https://example.com/interview-review",
      fingerprint: `seed-${runId}`,
      snapshot: {
        version: 1,
        source: {
          platform: "web",
          sourceUrl: "https://example.com/interview-review",
          author: "示例作者",
          title: "面试复盘方法论",
        },
        summary: "一篇关于面试复盘方法的公开文章。",
        structure: ["先讲失败案例", "给出三步复盘法", "结尾引导讨论"],
        opening: "以真实失败经历开场",
        corePoints: ["复盘要在 24 小时内完成"],
        emotionAndPacing: "先共情后方法",
        facts: [{ label: "数据", excerpt: "调查显示 70% 的候选人从不复盘面试。" }],
        boundaries: ["不冒充原作者", "不复制完整正文"],
        provenance: {
          method: "basic_fetch",
          importedAt: new Date().toISOString(),
          fingerprint: `seed-${runId}`,
          transcriptUsed: false,
        },
      },
    },
  });

  await prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content: `原创稿已生成:「${SEED_TITLE}」(v1,评分 62/100)。`,
      status: "complete",
      clientMessageId: `artifact:seed-${runId}`,
      metadata: {
        protocol: "star-chat/v1",
        cards: [
          {
            id: `card-artifact-seed-${runId}`,
            version: 1,
            type: "artifact",
            contentId,
            revisionId: revision.id,
            revisionNumber: 1,
            platform: "xiaohongshu",
            contentKind: "xhs_graphic",
            title: SEED_TITLE,
            preview: SEED_BODY,
            score: 62,
            actions: [
              { actionId: "artifact.open", label: "打开编辑", appearance: "primary", repeatable: true },
              { actionId: "artifact.refine", label: "继续优化", repeatable: true },
            ],
          },
        ],
      },
    },
  });
});

test.afterAll(async () => {
  // 只清理本轮种子;不触碰 dev 用户与其他数据
  await prisma.generatedContent.deleteMany({ where: { id: contentId, userId } });
  await prisma.conversation.deleteMany({ where: { id: conversationId, userId } });
  await prisma.$disconnect();
});

test.describe("C5 Artifact 面板(桌面 1440×900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("成果卡 → 面板 → 编辑/版本/恢复/冲突全链路", async ({ page }) => {
    test.setTimeout(180000);
    await page.goto(`/creator/xiaohongshu?conversationId=${conversationId}`);

    // 1. 成果卡出现,打开面板
    const card = page.locator('[data-testid^="card-artifact-"]');
    await expect(card).toBeVisible({ timeout: 20000 });
    await card.locator('[data-testid="artifact-action-artifact.open"]').click();
    const panel = page.getByTestId("artifact-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v1/, {
      timeout: 15000,
    });
    const titleInput = panel.locator("#artifact-title");
    await expect(titleInput).toHaveValue(SEED_TITLE);
    await assertNoHorizontalOverflow(page, 1440);

    // 2. 结构标签:分页只读预览
    await panel.getByRole("tab", { name: "结构" }).click();
    await expect(panel.getByTestId("artifact-structure-page-1")).toBeVisible();
    await expect(panel.getByTestId("artifact-structure-page-2")).toContainText("三个复盘步骤");

    // 3. 评分与证据:警告可定位到对应内容块
    await panel.getByRole("tab", { name: "评分与证据" }).click();
    const warning = panel.getByTestId("artifact-score-warning").first();
    await expect(warning).toContainText("至少提供 3 个标题候选");
    await warning.click();
    // hook 维度 → 内容标签的标题块
    await expect(titleInput).toBeVisible();

    // 4. 证据编号 → 抽屉详情
    await panel.getByRole("tab", { name: "评分与证据" }).click();
    await panel.getByTestId("artifact-evidence-1").click();
    const drawer = page.getByTestId("artifact-evidence-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("面试复盘方法论");
    await expect(drawer).toContainText("不可模仿边界");
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(panel).toBeVisible(); // 抽屉的 Esc 不应连带关闭面板

    // 5. 手动编辑标题 → 自动保存为 v2(manual)
    await panel.getByRole("tab", { name: "内容" }).click();
    await titleInput.fill("手动修改后的标题");
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/未保存|保存中/);
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v2/, {
      timeout: 20000,
    });

    // 6. 查看 v1:只读预览,不产生新版本(C6 起查看历史版本不可编辑)
    await panel.getByTestId("artifact-revision-menu-trigger").click();
    await panel
      .getByTestId("artifact-revision-item-1")
      .getByRole("button", { name: "查看" })
      .click();
    await expect(titleInput).toHaveValue(SEED_TITLE);
    await expect(panel.getByTestId("artifact-preview-banner")).toBeVisible();
    await expect(titleInput).toBeDisabled();
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v1/);
    await page.waitForTimeout(3500); // 超过自动保存窗口,确认没有偷偷建版
    await panel.getByTestId("artifact-revision-menu-trigger").click();
    await expect(
      panel.locator('[data-testid^="artifact-revision-item-"]'),
    ).toHaveCount(2);

    // 7. 恢复 v1 → 服务端按 v1 payload 创建 v3(restored);恢复后退出只读预览
    await panel
      .getByTestId("artifact-revision-item-1")
      .getByRole("button", { name: "恢复" })
      .click();
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v3/, {
      timeout: 15000,
    });
    await expect(panel.getByTestId("artifact-preview-banner")).toBeHidden();
    await expect(titleInput).toHaveValue(SEED_TITLE);
    await expect(titleInput).toBeEnabled();
    await panel.getByTestId("artifact-revision-menu-trigger").click();
    const revisionItems = panel.locator('[data-testid^="artifact-revision-item-"]');
    await expect(revisionItems).toHaveCount(3);
    await expect(panel.getByTestId("artifact-revision-item-3")).toContainText("恢复");
    await page.keyboard.press("Escape"); // 关闭版本菜单

    // 8. 冲突(查看自己的版本时外部生成完成):选择「切换到新版本」
    await insertExternalGeneratedRevision("外部生成标题一", "外部生成正文一。");
    const conflict = panel.getByTestId("artifact-conflict");
    await expect(conflict).toBeVisible({ timeout: 20000 });
    await expect(conflict).toContainText("生成完成:v4");
    await conflict.getByTestId("artifact-conflict-use-incoming").click();
    await expect(conflict).toBeHidden();
    await expect(titleInput).toHaveValue("外部生成标题一");
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v4/);
    // 关掉「已切换到 v4」提示,避免与下一步的更新提示混淆
    await panel.getByTestId("artifact-update-notice").getByText("知道了").click();
    await expect(panel.getByTestId("artifact-update-notice")).toBeHidden();

    // 9. 正在看最新生成版且无修改:外部又有新版本 → 自动跟随并提示,不弹冲突
    await insertExternalGeneratedRevision("外部生成标题二", "外部生成正文二。");
    await expect(panel.getByTestId("artifact-update-notice")).toContainText(
      "已更新到 v5",
      { timeout: 20000 },
    );
    await expect(titleInput).toHaveValue("外部生成标题二", { timeout: 15000 });
    await expect(panel.getByTestId("artifact-conflict")).toBeHidden();

    // 10. 冲突:选择「保留我的版本」
    await titleInput.fill("我的第二次手动标题");
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v6/, {
      timeout: 20000,
    });
    await insertExternalGeneratedRevision("外部生成标题三", "外部生成正文三。");
    await expect(conflict).toBeVisible({ timeout: 20000 });
    await conflict.getByTestId("artifact-conflict-keep-mine").click();
    await expect(conflict).toBeHidden();
    await expect(titleInput).toHaveValue("我的第二次手动标题");
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v6/);

    // 11. 关闭面板后对话仍可用,顶栏可重新打开作品
    await panel.getByTestId("artifact-panel-close").click();
    await expect(panel).toBeHidden();
    await expect(card).toBeVisible();
    await page.getByTestId("topbar-open-artifact").click();
    await expect(page.getByTestId("artifact-panel")).toBeVisible();
    await assertNoHorizontalOverflow(page, 1440);
  });
});

test.describe("C5 Artifact 面板(手机 390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("手机上一次只显示对话或 Artifact,面板全屏且可关闭", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(`/creator/xiaohongshu?conversationId=${conversationId}`);

    const card = page.locator('[data-testid^="card-artifact-"]');
    await expect(card).toBeVisible({ timeout: 20000 });
    await card.locator('[data-testid="artifact-action-artifact.open"]').click();

    const container = page.getByTestId("artifact-panel-container");
    await expect(container).toBeVisible();
    const box = await container.boundingBox();
    expect(box?.x).toBe(0);
    expect(box?.y).toBe(0);
    expect(Math.round(box?.width ?? 0)).toBe(390);
    expect(Math.round(box?.height ?? 0)).toBe(844);
    await assertNoHorizontalOverflow(page, 390);

    await page.getByTestId("artifact-panel-close").click();
    await expect(container).toBeHidden();
    await expect(page.getByLabel("创作输入框")).toBeVisible();
    await assertNoHorizontalOverflow(page, 390);
  });
});
