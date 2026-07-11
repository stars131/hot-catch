import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * C6 结构化编辑器端到端验证。
 *
 * 通过数据库种子构造「已生成初稿」的小红书与抖音内容(生成依赖真实 LLM 凭证,属 C10 验收),
 * 验证真实 UI + 真实 API + 真实数据库:
 * 小红书阅读顺序渐进编辑(标题备选/封面/分页/标签/风险) →
 * 抖音分镜时间轴(默认四字段/高级项/时间即时校验/加删镜) →
 * 结构大纲跳转 → 「让星迹修改」预填 Composer → 手机单镜全屏编辑。
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
let xhsContentId = "";
let douyinContentId = "";
let userId = "";

const XHS_TITLE = "AI 面试复盘的三个步骤";
const XHS_BODY = "这是种子初稿正文,用于验证小红书结构化编辑器。".repeat(3);

const XHS_STRUCTURED = {
  title: XHS_TITLE,
  titleOptions: ["面试挂了别急着投下一家", "复盘一次面试只要 20 分钟", "面试复盘模板直接抄"],
  coverTextOptions: ["面试复盘", "避坑指南"],
  pages: [
    {
      pageNumber: 1,
      heading: "开场",
      body: "第一页:为什么要复盘面试。",
      visualSuggestion: "大字标题",
    },
    {
      pageNumber: 2,
      heading: "方法",
      body: "第二页:三个复盘步骤。",
      visualSuggestion: "步骤清单",
    },
    {
      pageNumber: 3,
      heading: "收尾",
      body: "第三页:复盘后的行动清单。",
      visualSuggestion: "行动清单排版",
    },
  ],
  bodyText: XHS_BODY,
  tags: ["求职", "复盘"],
  interactionEnding: "你最近一次面试卡在哪一步?评论区聊聊。",
  riskNotes: ["不承诺面试结果"],
};

const DOUYIN_TITLE = "通勤 40 分钟高效利用法";
const DOUYIN_CAPTION = "通勤时间也能高效利用,三个习惯让你每天多出 40 分钟。";

const DOUYIN_STRUCTURED = {
  title: DOUYIN_TITLE,
  hook: "你每天通勤浪费的 40 分钟",
  durationSec: 30,
  shots: [
    {
      startSec: 0,
      endSec: 3,
      voiceover: "通勤时间你都在干嘛?",
      visual: "地铁人群特写",
      subtitle: "通勤 40 分钟",
      camera: "近景",
      transition: "硬切",
      music: "节奏鼓点",
      risk: "",
    },
    {
      startSec: 3,
      endSec: 18,
      voiceover: "三个可以立刻用起来的效率习惯",
      visual: "手机屏幕操作演示",
      subtitle: "3 个习惯",
      camera: "俯拍",
      transition: "推近",
      music: "轻快",
      risk: "",
    },
    {
      startSec: 18,
      endSec: 30,
      voiceover: "关注我,下期讲午休恢复法",
      visual: "出镜口播",
      subtitle: "关注不迷路",
      camera: "中景",
      transition: "淡出",
      music: "收尾",
      risk: "不承诺效果",
    },
  ],
  caption: DOUYIN_CAPTION,
  tags: ["效率", "通勤", "时间管理"],
  riskNotes: ["不承诺具体收益"],
};

async function assertNoHorizontalOverflow(page: Page, width: number) {
  const scrollWidth = await page.evaluate(
    () => document.scrollingElement?.scrollWidth ?? 0,
  );
  expect(scrollWidth).toBeLessThanOrEqual(width);
}

function artifactCardMetadata(params: {
  cardId: string;
  contentId: string;
  revisionId: string;
  platform: "xiaohongshu" | "douyin";
  contentKind: "xhs_graphic" | "douyin_video_script";
  title: string;
  preview: string;
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
        platform: params.platform,
        contentKind: params.contentKind,
        title: params.title,
        preview: params.preview,
        actions: [
          {
            actionId: "artifact.open",
            label: "打开编辑",
            appearance: "primary",
            repeatable: true,
          },
          { actionId: "artifact.refine", label: "继续优化", repeatable: true },
        ],
      },
    ],
  };
}

test.beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { email: "dev@example.com" },
    update: {},
    create: { email: "dev@example.com", name: "Dev User" },
  });
  userId = user.id;

  const conversation = await prisma.conversation.create({
    data: { userId, title: `C6 编辑器测试 ${runId}` },
  });
  conversationId = conversation.id;

  const xhsContent = await prisma.generatedContent.create({
    data: {
      userId,
      conversationId,
      platform: "xiaohongshu",
      contentKind: "xhs_graphic",
      outputType: "xhs_graphic",
      title: XHS_TITLE,
      bodyText: XHS_BODY,
      status: "saved",
      tags: XHS_STRUCTURED.tags,
      interactionEnding: XHS_STRUCTURED.interactionEnding,
      riskNotes: "不承诺面试结果",
      scoreSnapshot: {
        total: 70,
        maxScore: 100,
        dimensions: [
          {
            key: "hook",
            label: "标题与开场",
            score: 12,
            maxScore: 20,
            reasons: ["主标题长度建议为 8–30 字"],
          },
          { key: "value", label: "信息价值", score: 25, maxScore: 25, reasons: [] },
        ],
        warnings: ["主标题长度建议为 8–30 字"],
      },
    },
  });
  xhsContentId = xhsContent.id;

  const xhsRevision = await prisma.contentRevision.create({
    data: {
      userId,
      contentId: xhsContentId,
      revisionNumber: 1,
      source: "generated",
      title: XHS_TITLE,
      bodyText: XHS_BODY,
      structuredContent: XHS_STRUCTURED,
      fullMarkdown: `# ${XHS_TITLE}\n\n${XHS_BODY}`,
      checksum: `seed-c6-xhs-${runId}`,
    },
  });

  const douyinContent = await prisma.generatedContent.create({
    data: {
      userId,
      conversationId,
      platform: "douyin",
      contentKind: "douyin_video_script",
      outputType: "douyin_video_script",
      title: DOUYIN_TITLE,
      bodyText: DOUYIN_CAPTION,
      status: "saved",
      tags: DOUYIN_STRUCTURED.tags,
      riskNotes: "不承诺具体收益",
    },
  });
  douyinContentId = douyinContent.id;

  const douyinRevision = await prisma.contentRevision.create({
    data: {
      userId,
      contentId: douyinContentId,
      revisionNumber: 1,
      source: "generated",
      title: DOUYIN_TITLE,
      bodyText: DOUYIN_CAPTION,
      structuredContent: DOUYIN_STRUCTURED,
      fullMarkdown: `# ${DOUYIN_TITLE}\n\n${DOUYIN_CAPTION}`,
      checksum: `seed-c6-douyin-${runId}`,
    },
  });

  await prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content: `原创稿已生成:「${XHS_TITLE}」(v1)。`,
      status: "complete",
      clientMessageId: `artifact:c6-xhs-${runId}`,
      metadata: artifactCardMetadata({
        cardId: `card-c6-xhs-${runId}`,
        contentId: xhsContentId,
        revisionId: xhsRevision.id,
        platform: "xiaohongshu",
        contentKind: "xhs_graphic",
        title: XHS_TITLE,
        preview: XHS_BODY.slice(0, 60),
      }),
    },
  });

  await prisma.message.create({
    data: {
      conversationId,
      role: "assistant",
      content: `脚本已生成:「${DOUYIN_TITLE}」(v1)。`,
      status: "complete",
      clientMessageId: `artifact:c6-douyin-${runId}`,
      metadata: artifactCardMetadata({
        cardId: `card-c6-douyin-${runId}`,
        contentId: douyinContentId,
        revisionId: douyinRevision.id,
        platform: "douyin",
        contentKind: "douyin_video_script",
        title: DOUYIN_TITLE,
        preview: DOUYIN_CAPTION,
      }),
    },
  });
});

test.afterAll(async () => {
  // 只清理本轮种子;不触碰 dev 用户与其他数据
  await prisma.generatedContent.deleteMany({
    where: { id: { in: [xhsContentId, douyinContentId] }, userId },
  });
  await prisma.conversation.deleteMany({ where: { id: conversationId, userId } });
  await prisma.$disconnect();
});

async function openArtifact(page: Page, cardId: string) {
  const card = page.getByTestId(`card-artifact-${cardId}`);
  await expect(card).toBeVisible({ timeout: 20000 });
  await card.getByTestId("artifact-action-artifact.open").click();
  const panel = page.getByTestId("artifact-panel");
  await expect(panel).toBeVisible();
  return panel;
}

test.describe("C6 小红书结构化编辑器(桌面 1440×900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("阅读顺序渐进编辑:标题备选/封面/分页/标签/风险 + 大纲跳转 + 让星迹修改", async ({
    page,
  }) => {
    test.setTimeout(180000);
    await page.goto(`/creator/xiaohongshu?conversationId=${conversationId}`);
    const panel = await openArtifact(page, `card-c6-xhs-${runId}`);
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v1/, {
      timeout: 15000,
    });

    // 1. 阅读顺序的区块都在「内容」标签,视觉建议默认收起
    for (const label of ["标题", "封面文案建议", "完整正文", "互动收尾", "风险说明"]) {
      await expect(panel.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(panel.getByTestId("artifact-page-1")).toBeVisible();
    await expect(panel.getByLabel("第 1 页视觉建议")).toBeHidden();
    await assertNoHorizontalOverflow(page, 1440);

    // 2. 备选标题按需展开,「换用」直接替换主标题
    await panel.getByTestId("artifact-title-options-toggle").click();
    const options = panel.getByTestId("artifact-title-options");
    await expect(options).toBeVisible();
    await options.getByRole("button", { name: "换用" }).first().click();
    await expect(panel.locator("#artifact-title")).toHaveValue(
      "面试挂了别急着投下一家",
    );
    // 原主标题回到备选列表,候选不丢
    await expect(options).toContainText(XHS_TITLE);
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v2/, {
      timeout: 20000,
    });

    // 3. 分页编辑:改第 2 页小标题;展开视觉建议编辑
    await panel.getByLabel("第 2 页小标题").fill("方法(已修改)");
    const page1 = panel.getByTestId("artifact-page-1");
    await page1.getByRole("button", { name: /视觉建议/ }).click();
    await panel.getByLabel("第 1 页视觉建议").fill("改成对比排版");
    // 自动保存按输入节奏可能合并或拆分为多个版本,只断言编辑已落库(≥v3)
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(
      /已保存 v(?!1$|2$)\d+/,
      { timeout: 20000 },
    );

    // 4. 在第 1 页后插入新页并填写,页码自动重排
    await page1.getByRole("button", { name: "在此页后加页" }).click();
    await expect(panel.locator('[data-testid^="artifact-page-"]')).toHaveCount(4);
    await panel.getByLabel("第 2 页小标题").fill("新插入的一页");

    // 5. 标签增删
    const tagInput = panel.getByLabel("添加标签");
    await tagInput.fill("面试");
    await tagInput.press("Enter");
    await expect(panel.getByText("#面试")).toBeVisible();
    await panel.getByLabel("删除标签 求职").click();
    await expect(panel.getByText("#求职")).toBeHidden();

    // 6. 风险说明增删
    await panel.getByRole("button", { name: "添加风险说明" }).click();
    await panel.getByLabel("风险说明 2", { exact: true }).fill("不使用绝对化表述");

    // 7. 结构大纲:反映最新分页,点击跳回内容标签对应页
    await panel.getByRole("tab", { name: "结构" }).click();
    await expect(
      panel.locator('[data-testid^="artifact-structure-page-"]'),
    ).toHaveCount(4);
    await expect(panel.getByTestId("artifact-structure-page-2")).toContainText(
      "新插入的一页",
    );
    await panel.getByTestId("artifact-structure-page-3").click();
    await expect(panel.getByLabel("第 3 页小标题")).toBeVisible();
    await expect(panel.getByLabel("第 3 页小标题")).toHaveValue("方法(已修改)");

    // 8. 评分警告定位到内容标签的标题块
    await panel.getByRole("tab", { name: "评分与证据" }).click();
    await panel.getByTestId("artifact-score-warning").first().click();
    await expect(panel.locator("#artifact-title")).toBeVisible();

    // 9. 选中正文一段文字 → 让星迹修改 → Composer 预填指令,面板保持打开
    await panel.locator("#artifact-body").evaluate((element) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(0, 10);
    });
    await panel
      .locator('[data-artifact-block="artifact-block-body"]')
      .getByTestId("artifact-refine-trigger")
      .click();
    const composer = page.getByLabel("创作输入框");
    await expect(composer).toHaveValue(/^请修改完整正文.+选中的这段:「这是种子初稿正文/);
    await expect(panel).toBeVisible();

    // 10. 分页级「让星迹修改」带页码与小标题
    await panel
      .getByTestId("artifact-page-3")
      .getByTestId("artifact-refine-trigger")
      .click();
    await expect(composer).toHaveValue(/^请修改第 3 页「方法/);
    await assertNoHorizontalOverflow(page, 1440);
  });
});

test.describe("C6 抖音分镜时间轴(桌面 1440×900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("默认四字段 + 高级项 + 时间即时校验 + 加删镜 + 大纲跳转", async ({ page }) => {
    test.setTimeout(180000);
    await page.goto(`/creator/douyin?conversationId=${conversationId}`);
    const panel = await openArtifact(page, `card-c6-douyin-${runId}`);
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v1/, {
      timeout: 15000,
    });

    // 1. 时间轴形态:逐镜一行,默认只露时间/口播/画面/字幕,高级项不可见
    await expect(panel.locator('[data-testid^="artifact-shot-open-"]')).toHaveCount(3);
    await expect(panel.getByTestId("artifact-shot-1")).toContainText("通勤时间你都在干嘛?");
    await expect(panel.getByTestId("artifact-shot-1")).toContainText("画面:地铁人群特写");
    await expect(panel.locator("#shot-0-camera")).toBeHidden();
    await expect(panel.getByTestId("artifact-storyboard-issues")).toBeHidden();
    await assertNoHorizontalOverflow(page, 1440);

    // 2. 展开第 2 镜:编辑口播;高级项按需展开后改镜头
    await panel.getByTestId("artifact-shot-open-2").click();
    await panel.locator("#shot-1-voiceover").fill("三个立刻能用的效率习惯(改)");
    await panel.getByRole("button", { name: /高级项/ }).click();
    await expect(panel.locator("#shot-1-camera")).toBeVisible();
    await panel.locator("#shot-1-camera").fill("特写");
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(
      /已保存 v(?!1$)\d+/,
      { timeout: 20000 },
    );

    // 3. 时间即时校验:把第 2 镜结束改成 15 → 与第 3 镜不连续;改回后恢复
    await panel.getByLabel("第 2 镜结束(秒)").fill("15");
    const issues = panel.getByTestId("artifact-storyboard-issues");
    await expect(issues).toBeVisible();
    await expect(issues).toContainText("第 3 镜与上一镜不连续");
    await panel.getByLabel("第 2 镜结束(秒)").fill("18");
    await expect(issues).toBeHidden();

    // 4. 总时长校验与对齐:改声明总时长 45 → 提示不一致 → 一键对齐尾镜
    await panel.getByLabel("总时长").fill("45");
    await expect(issues).toContainText("总时长");
    await panel.getByTestId("artifact-align-duration").click();
    await expect(issues).toBeHidden();
    await expect(panel.getByLabel("总时长")).toHaveValue("30");

    // 5. 在第 3 镜后加镜(自动衔接 30s 起)再删除
    await panel.getByTestId("artifact-shot-open-3").click();
    await panel.getByRole("button", { name: "在此镜后加镜" }).click();
    await expect(panel.locator('[data-testid^="artifact-shot-open-"]')).toHaveCount(4);
    await expect(panel.getByTestId("artifact-shot-4")).toContainText("30s–33s");
    await panel.getByTestId("artifact-shot-4").getByRole("button", { name: "删除此镜" }).click();
    await expect(panel.locator('[data-testid^="artifact-shot-open-"]')).toHaveCount(3);

    // 6. 结构大纲:时间轴概览可跳回单镜
    await panel.getByRole("tab", { name: "结构" }).click();
    await expect(
      panel.locator('[data-testid^="artifact-structure-shot-"]'),
    ).toHaveCount(3);
    await panel.getByTestId("artifact-structure-shot-2").click();
    await expect(panel.getByTestId("artifact-shot-2")).toBeVisible();

    // 7. 单镜「让星迹修改」预填 Composer(桌面面板保持打开)
    await panel
      .getByTestId("artifact-shot-1")
      .getByTestId("artifact-refine-trigger")
      .click();
    await expect(page.getByLabel("创作输入框")).toHaveValue(/^请修改第 1 镜/);
    await expect(panel).toBeVisible();
    await assertNoHorizontalOverflow(page, 1440);
  });
});

test.describe("C6 手机(390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("抖音单镜全屏编辑:Sheet 只关自己,不关面板;让星迹修改回到对话", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.goto(`/creator/douyin?conversationId=${conversationId}`);
    const panel = await openArtifact(page, `card-c6-douyin-${runId}`);

    // 面板全屏
    const container = page.getByTestId("artifact-panel-container");
    const box = await container.boundingBox();
    expect(Math.round(box?.width ?? 0)).toBe(390);
    expect(Math.round(box?.height ?? 0)).toBe(844);
    await assertNoHorizontalOverflow(page, 390);

    // 点击单镜 → 全屏 Sheet,高级项直接可见
    await panel.getByTestId("artifact-shot-open-1").click();
    const sheet = page.getByTestId("artifact-shot-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.locator("#shot-0-camera")).toBeVisible();
    await sheet.locator("#shot-0-subtitle").fill("通勤 40 分钟(手机改)");

    // 完成只关 Sheet,面板还在
    await sheet.getByTestId("artifact-shot-sheet-done").click();
    await expect(sheet).toBeHidden();
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("artifact-shot-1")).toContainText(
      "通勤 40 分钟(手机改)",
    );

    // Esc 只关 Sheet,不关面板
    await panel.getByTestId("artifact-shot-open-2").click();
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(panel).toBeVisible();

    // Sheet 里的「让星迹修改」:收起面板回到对话,Composer 已预填
    await panel.getByTestId("artifact-shot-open-3").click();
    await expect(sheet).toBeVisible();
    await sheet.getByTestId("artifact-refine-trigger").click();
    await expect(page.getByTestId("artifact-panel")).toBeHidden();
    const composer = page.getByLabel("创作输入框");
    await expect(composer).toBeVisible();
    await expect(composer).toHaveValue(/^请修改第 3 镜/);
    await assertNoHorizontalOverflow(page, 390);
  });

  test("小红书编辑器手机可用:分页可编辑,无横向溢出", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto(`/creator/xiaohongshu?conversationId=${conversationId}`);
    const panel = await openArtifact(page, `card-c6-xhs-${runId}`);

    await expect(panel.locator("#artifact-title")).toBeVisible();
    await expect(panel.getByTestId("artifact-page-1")).toBeVisible();
    const heading = panel.getByLabel("第 1 页小标题");
    await heading.fill("手机上改的标题");
    await expect(panel.getByTestId("artifact-save-state")).toHaveText(/已保存 v\d+/, {
      timeout: 20000,
    });
    await assertNoHorizontalOverflow(page, 390);

    // 关闭面板回到对话,Composer 未被遮挡
    await panel.getByTestId("artifact-panel-close").click();
    await expect(page.getByLabel("创作输入框")).toBeVisible();
    await assertNoHorizontalOverflow(page, 390);
  });
});
