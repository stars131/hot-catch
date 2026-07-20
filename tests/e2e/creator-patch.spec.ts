import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { fixtureChecksum } from "./helpers/checksum";

/**
 * C7 修改提案(content.propose_patch)端到端验证。
 *
 * 真实 UI + 真实 API + 真实数据库,提案由本地确定性规则生成(协议预览):
 * 选中区块「让星迹修改」 → 修改目标 Chip → 技能菜单 →
 * 补丁提案卡(修改前/后) → 复制到编辑器 → 过期提案安全拦截 →
 * 应用为新版本 → 忽略提案 → 手机 390×844 可用性。
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
let userId = "";

const XHS_TITLE = "AI 面试复盘的三个步骤";
const XHS_BODY =
  "其实很多人面试完就直接投下一家了。然后同样的问题就是说会再犯一遍。复盘其实只需要二十分钟。";

const XHS_STRUCTURED = {
  title: XHS_TITLE,
  pages: [
    { pageNumber: 1, heading: "开场", body: "第一页:为什么要复盘面试。" },
    { pageNumber: 2, heading: "方法", body: "第二页:包含需要修改的句子。" },
  ],
  bodyText: XHS_BODY,
  tags: ["求职", "复盘"],
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
        ],
      },
    ],
  };
}

/** 每个用例独立种子,避免用例间版本号互相干扰。 */
async function seedConversation(tag: string) {
  const user = await prisma.user.upsert({
    where: { email: "dev@example.com" },
    update: {},
    create: { email: "dev@example.com", name: "Dev User" },
  });
  userId = user.id;
  const conversation = await prisma.conversation.create({
    data: { userId, title: `C7 补丁测试 ${tag} ${runId}` },
  });
  const content = await prisma.generatedContent.create({
    data: {
      userId,
      conversationId: conversation.id,
      platform: "xiaohongshu",
      contentKind: "xhs_graphic",
      outputType: "xhs_graphic",
      title: XHS_TITLE,
      bodyText: XHS_BODY,
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
      title: XHS_TITLE,
      bodyText: XHS_BODY,
      structuredContent: XHS_STRUCTURED,
      fullMarkdown: `# ${XHS_TITLE}\n\n${XHS_BODY}`,
      checksum: fixtureChecksum(`seed-c7-${tag}-${runId}`),
    },
  });
  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "assistant",
      content: `原创稿已生成:「${XHS_TITLE}」(v1)。`,
      status: "complete",
      clientMessageId: `artifact:c7-${tag}-${runId}`,
      metadata: artifactCardMetadata({
        cardId: `card-c7-${tag}-${runId}`,
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
  // 只清理本轮种子;不触碰 dev 用户与其他数据
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

/** 选中正文前 N 个字符并点「让星迹修改」。 */
async function askRefineBody(page: Page, panel: ReturnType<Page["getByTestId"]>, chars: number) {
  await panel.locator("#artifact-body").evaluate((element, count) => {
    const textarea = element as HTMLTextAreaElement;
    textarea.focus();
    textarea.setSelectionRange(0, count);
  }, chars);
  await panel
    .locator('[data-artifact-block="artifact-block-body"]')
    .getByTestId("artifact-refine-trigger")
    .click();
}

test.describe("C7 修改提案(桌面 1440×900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("选中改写 → 技能菜单 → 提案卡 → 应用为新版本 → 忽略", async ({ page }) => {
    test.setTimeout(240000);
    const seed = await seedConversation("apply");
    seededContentIds.push(seed.contentId);
    seededConversationIds.push(seed.conversationId);

    await page.goto(`/creator/xiaohongshu?conversationId=${seed.conversationId}`);
    const panel = await openArtifact(page, `card-c7-apply-${runId}`);
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v1/, {
      timeout: 15000,
    });

    // 1. 选中正文一段 → Composer 预填 + 修改目标 Chip
    await askRefineBody(page, panel, 16);
    const composer = page.getByLabel("创作输入框");
    await expect(composer).toHaveValue(/^请修改完整正文.+选中的这段/);
    await expect(page.getByTestId("composer-chips")).toContainText("修改：完整正文");

    // 2. 技能菜单来自内置注册表;选「压缩精简」替换指令并绑定 skillId
    await page.getByLabel("添加资料或技能").click();
    await page.getByTestId("composer-skills-toggle").click();
    const skillList = page.getByTestId("composer-skill-list");
    await expect(skillList).toBeVisible();
    await expect(skillList).toContainText("改写选中段落");
    await expect(skillList).toContainText("风险与合规检查");
    await page.getByTestId("composer-skill-builtin.compress-text").click();
    await expect(composer).toHaveValue("请压缩完整正文,保留核心信息:");
    await expect(page.getByTestId("composer-chips")).toContainText("修改：完整正文");

    // 3. 发送 → 补丁提案卡:区块/版本/本地协议预览标注/修改前后
    await composer.press("Enter");
    const patchCard = page.getByTestId("patch-card").first();
    await expect(patchCard).toBeVisible({ timeout: 30000 });
    await expect(patchCard).toContainText("修改提案:完整正文");
    await expect(patchCard).toContainText("基于 v1");
    await expect(patchCard).toContainText("本地协议预览");
    await expect(patchCard.getByTestId("patch-before")).toContainText("其实很多人");
    const afterText = await patchCard.getByTestId("patch-after").textContent();
    expect(afterText).not.toContain("其实");
    // 发送后修改目标 Chip 清空
    await expect(page.getByTestId("composer-chips")).toBeHidden();
    await assertNoHorizontalOverflow(page, 1440);

    // 4. 应用为新版本 → 成功回执 + 更新后的成果卡;数据库产生 v2
    await patchCard.getByTestId("patch-apply").click();
    await expect(page.getByText(/已把「完整正文」的修改提案应用为新版本 v2/)).toBeVisible({
      timeout: 30000,
    });
    await expect(patchCard).toHaveAttribute("data-patch-status", "applied");
    await expect(patchCard.getByTestId("patch-apply")).toBeDisabled();
    const revisions = await prisma.contentRevision.findMany({
      where: { contentId: seed.contentId },
      orderBy: { revisionNumber: "desc" },
    });
    expect(revisions[0].revisionNumber).toBe(2);
    expect(revisions[0].source).toBe("manual");
    expect((revisions[0].provenance as { type?: string })?.type).toBe("patch_apply");
    // 只替换选中摘录:开头的「其实」被压缩规则移除
    expect(revisions[0].bodyText?.startsWith("很多人")).toBe(true);
    // v1 原文保留,未被覆盖
    expect(revisions[1].bodyText).toContain("其实很多人");

    // 5. 编辑器跟随/提示新版本(无未保存修改时不静默覆盖历史)
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/v2/, {
      timeout: 15000,
    });

    // 6. 再发起一次提案并「忽略」:内容不变化
    await askRefineBody(page, panel, 12);
    await composer.press("End");
    await composer.pressSequentially("换成「复盘要趁热打铁」");
    await composer.press("Enter");
    const secondCard = page.getByTestId("patch-card").nth(1);
    await expect(secondCard).toBeVisible({ timeout: 30000 });
    await expect(secondCard.getByTestId("patch-after")).toContainText("复盘要趁热打铁");
    await secondCard.getByTestId("patch-dismiss").click();
    await expect(page.getByText(/已忽略「完整正文」的修改提案/)).toBeVisible({
      timeout: 30000,
    });
    await expect(secondCard).toHaveAttribute("data-patch-status", "dismissed");
    const countAfterDismiss = await prisma.contentRevision.count({
      where: { contentId: seed.contentId },
    });
    expect(countAfterDismiss).toBe(2);
  });

  test("复制到编辑器 → 过期提案被安全拦截,不覆盖后续修改", async ({ page }) => {
    test.setTimeout(240000);
    const seed = await seedConversation("stale");
    seededContentIds.push(seed.contentId);
    seededConversationIds.push(seed.conversationId);

    await page.goto(`/creator/xiaohongshu?conversationId=${seed.conversationId}`);
    const panel = await openArtifact(page, `card-c7-stale-${runId}`);
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v1/, {
      timeout: 15000,
    });

    // 1. 生成一条基于 v1 的提案
    await askRefineBody(page, panel, 16);
    const composer = page.getByLabel("创作输入框");
    await composer.press("End");
    await composer.pressSequentially("换成「面试结束当晚就复盘」");
    await composer.press("Enter");
    const patchCard = page.getByTestId("patch-card").first();
    await expect(patchCard).toBeVisible({ timeout: 30000 });
    await expect(patchCard.getByTestId("patch-after")).toContainText("面试结束当晚就复盘");

    // 2. 复制到编辑器:提案文本写入草稿,作为手动修改自动保存(v2)
    await patchCard.getByTestId("patch-copy-editor").click();
    await expect(panel.getByTestId("artifact-insert-notice")).toContainText(
      "已把提案文本复制到编辑器",
    );
    await expect(panel.locator("#artifact-body")).toHaveValue(/面试结束当晚就复盘/);
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v2/, {
      timeout: 20000,
    });

    // 3. 内容已到 v2,再应用基于 v1 的提案 → 安全拦截,不产生新版本
    await patchCard.getByTestId("patch-apply").click();
    await expect(page.getByText("提案已过期,未做任何修改")).toBeVisible({ timeout: 30000 });
    const revisions = await prisma.contentRevision.findMany({
      where: { contentId: seed.contentId },
      orderBy: { revisionNumber: "desc" },
    });
    expect(revisions).toHaveLength(2);
    expect(revisions[0].revisionNumber).toBe(2);
    expect(revisions[0].source).toBe("manual");
  });
});

test.describe("C7 修改提案(手机 390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("提案卡与技能菜单在手机可用,无横向溢出,操作不被遮挡", async ({ page }) => {
    test.setTimeout(240000);
    const seed = await seedConversation("mobile");
    seededContentIds.push(seed.contentId);
    seededConversationIds.push(seed.conversationId);

    await page.goto(`/creator/xiaohongshu?conversationId=${seed.conversationId}`);
    const panel = await openArtifact(page, `card-c7-mobile-${runId}`);
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v1/, {
      timeout: 15000,
    });

    // 手机上「让星迹修改」收起面板回到对话,带修改目标 Chip
    await askRefineBody(page, panel, 12);
    await expect(page.getByTestId("artifact-panel")).toBeHidden();
    const composer = page.getByLabel("创作输入框");
    await expect(composer).toBeVisible();
    await expect(page.getByTestId("composer-chips")).toContainText("修改：完整正文");

    // 技能菜单可打开且不溢出
    // (Next.js dev 指示器悬浮在左下角,仅存在于开发模式,会挡住 + 按钮;测试中移除)
    await page.evaluate(() =>
      document.querySelectorAll("nextjs-portal").forEach((node) => node.remove()),
    );
    await page.getByLabel("添加资料或技能").click();
    await page.getByTestId("composer-skills-toggle").click();
    await expect(page.getByTestId("composer-skill-list")).toBeVisible();
    await assertNoHorizontalOverflow(page, 390);
    await page.getByTestId("composer-skill-builtin.expand-hook").click();
    await expect(composer).toHaveValue("请把完整正文的开头改得更抓人:");

    // 发送 → 提案卡在手机上完整可见、按钮可点
    await composer.press("Enter");
    const patchCard = page.getByTestId("patch-card").first();
    await expect(patchCard).toBeVisible({ timeout: 30000 });
    await expect(patchCard).toContainText("本地协议预览");
    await assertNoHorizontalOverflow(page, 390);
    const applyButton = page.getByTestId("patch-apply").last();
    await expect(applyButton).toBeVisible();
    await applyButton.click();
    await expect(page.getByText(/应用为新版本 v2/)).toBeVisible({ timeout: 30000 });
    await assertNoHorizontalOverflow(page, 390);
  });
});
