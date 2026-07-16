import { test, expect, type Page } from "@playwright/test";

const XHS = "/creator/xiaohongshu";

async function pageOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
}

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`));
  return errors;
}

test.describe("C2 创作壳层(桌面 1440×900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("空会话首屏是 Agent 助手,不是项目表单", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(XHS);
    await expect(page.getByRole("heading", { level: 2, name: "今天想创作什么?" })).toBeVisible();
    await expect(page.getByRole("button", { name: "从选题库开始" })).toBeVisible();
    await expect(page.getByLabel("创作输入框")).toBeVisible();
    // 旧 CMS 表单不得出现
    await expect(page.getByText("项目标题")).toHaveCount(0);
    await expect(page.getByText("内容简报")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "创建内容项目" })).toHaveCount(0);
    const overflow = await pageOverflow(page);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    expect(errors).toEqual([]);
  });

  test("首条消息懒创建会话,刷新后恢复历史", async ({ page }) => {
    const uniqueText = `你好星迹,恢复测试 ${Date.now()}`;
    await page.goto(XHS);
    const input = page.getByLabel("创作输入框");
    await input.fill(uniqueText);
    await input.press("Enter");

    await expect(page).toHaveURL(/conversationId=/, { timeout: 15000 });
    await expect(
      page.locator('li[data-role="user"]', { hasText: uniqueText }),
    ).toBeVisible();
    await expect(page.locator('li[data-role="assistant"]').first()).toBeVisible({
      timeout: 20000,
    });

    await page.reload();
    await expect(
      page.locator('li[data-role="user"]', { hasText: uniqueText }),
    ).toBeVisible({ timeout: 15000 });
    // 会话出现在侧栏
    await expect(
      page.getByTestId("conversation-list").getByText(uniqueText),
    ).toBeVisible();
  });

  test("平台切换保留当前会话", async ({ page }) => {
    await page.goto(XHS);
    const input = page.getByLabel("创作输入框");
    await input.fill("平台切换测试消息");
    await input.press("Enter");
    await expect(page).toHaveURL(/conversationId=/, { timeout: 15000 });
    const url = new URL(page.url());
    const conversationId = url.searchParams.get("conversationId")!;

    await page.getByTestId("platform-switcher").click();
    await page.getByRole("button", { name: "抖音脚本" }).click();
    await expect(page).toHaveURL(new RegExp(`/creator/douyin\\?.*${conversationId}`));
    await expect(
      page.locator('li[data-role="user"]', { hasText: "平台切换测试消息" }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("无效 conversationId 显示明确错误并可新建", async ({ page }) => {
    await page.goto(`${XHS}?conversationId=does-not-exist`);
    await expect(page.getByRole("heading", { name: "无法打开这个会话" })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "新建创作会话" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "今天想创作什么?" })).toBeVisible();
    expect(new URL(page.url()).searchParams.get("conversationId")).toBeNull();
  });

  test("/ideas 进入时内容项目显示为可移除 Chip,不展开表单", async ({ page }) => {
    const created = await page.request.post("/api/content", {
      data: {
        platform: "xiaohongshu",
        contentKind: "xhs_graphic",
        title: "C2 Chip 测试项目",
      },
    });
    expect(created.ok()).toBeTruthy();
    const { content } = await created.json();

    await page.goto(`${XHS}?contentId=${content.id}`);
    const chips = page.getByTestId("composer-chips");
    await expect(chips.getByText("C2 Chip 测试项目")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("内容简报")).toHaveCount(0);

    await page.getByRole("button", { name: /移除上下文/ }).click();
    await expect(chips).toHaveCount(0);
    await page.waitForURL((url) => url.searchParams.get("contentId") === null, {
      timeout: 10000,
    });
  });

  test("+ 菜单未实现能力明确标注即将支持;技能已启用(C7)", async ({ page }) => {
    await page.goto(XHS);
    await page.getByRole("button", { name: "添加资料或技能" }).click();
    await expect(page.getByText("上传素材")).toBeVisible();
    await expect(page.getByText("导入链接")).toBeVisible();
    await expect(page.getByText("技能")).toBeVisible();
    // C7 起「技能」由内置 Skill Registry 驱动,不再是占位;其余两项仍如实标注
    await expect(page.getByText("即将支持")).toHaveCount(2);
    await expect(page.getByRole("button", { name: /上传素材/ })).toBeDisabled();
    await page.getByTestId("composer-skills-toggle").click();
    await expect(page.getByTestId("composer-skill-list")).toBeVisible();
  });
});

test.describe("C2 创作壳层(手机 390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("单栏无横向溢出,Composer 不被遮挡,持久底部导航可用", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto(XHS);
    await expect(page.getByRole("heading", { level: 2, name: "今天想创作什么?" })).toBeVisible();

    const overflow = await pageOverflow(page);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(390);

    // Composer 完整落在视口内
    const composer = page.getByLabel("创作输入框");
    await expect(composer).toBeVisible();
    const box = (await composer.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(844);

    // C15 起工作区移动端保留持久底部导航，切页时创作壳层不再重新挂载。
    const mobileNav = page.getByRole("navigation", { name: "移动端主导航" });
    await expect(mobileNav).toBeVisible();
    await expect(mobileNav.getByText("热点")).toBeVisible();
    await expect(mobileNav.getByText("复盘")).toBeVisible();
    // 桌面限定文案不得出现
    await expect(page.getByText(/右侧内容画布/)).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("会话栏使用 Drawer 打开", async ({ page }) => {
    await page.goto(XHS);
    await page.getByRole("button", { name: "打开会话列表" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("button", { name: "新建创作" })).toBeVisible();
    await expect(drawer.getByTestId("conversation-list")).toBeVisible();
  });

  test("消息流状态下仍无横向溢出", async ({ page }) => {
    await page.goto(XHS);
    const input = page.getByLabel("创作输入框");
    await input.fill("手机端溢出检查这一条消息内容可以稍微长一点以测试换行是否正常");
    await input.press("Enter");
    await expect(page.locator('li[data-role="user"]')).toBeVisible({ timeout: 15000 });
    const overflow = await pageOverflow(page);
    expect(overflow.scrollWidth).toBeLessThanOrEqual(390);
  });
});
