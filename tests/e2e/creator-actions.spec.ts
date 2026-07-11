import { test, expect } from "@playwright/test";

const XHS = "/creator/xiaohongshu";
const LEGACY_PATTERNS = /add-account|\/analyze|Paste an XHS|benchmark session/i;

test.describe("C3 消息与卡片动作(桌面 1440×900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("发送消息 → 中文回复 + 方向选项卡 → 点击选项 → 刷新后卡片保持已处理", async ({
    page,
  }) => {
    const unique = `晨跑打卡 ${Date.now()}`;
    await page.goto(XHS);
    const input = page.getByLabel("创作输入框");
    await input.fill(`帮我写一篇小红书,主题是${unique}`);
    await input.press("Enter");

    // 助手中文回复与选项卡
    await expect(page).toHaveURL(/conversationId=/, { timeout: 15000 });
    const assistant = page.locator('li[data-role="assistant"]').first();
    await expect(assistant).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("选择内容方向")).toBeVisible();
    const bodyText = await page.locator("main").innerText();
    expect(bodyText).not.toMatch(LEGACY_PATTERNS);

    // 点击选项并提交
    await page.getByRole("radio", { name: /经验分享/ }).click();
    await page.getByRole("button", { name: "确认方向" }).click();
    await expect(page.getByText(/方向定为「经验分享」/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("已选择")).toBeVisible();

    // 刷新:消息、结果与已处理状态全部从数据库恢复
    await page.reload();
    await expect(page.getByText("选择内容方向")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/方向定为「经验分享」/)).toBeVisible();
    await expect(page.getByText("已选择")).toBeVisible();
    await expect(page.getByRole("button", { name: "确认方向" })).toHaveCount(0);

    // 再次发送:不再重复出示方向卡
    await input.fill("目标读者是刚开始运动的上班族");
    await input.press("Enter");
    await expect(page.getByText(/已记录/)).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("选择内容方向")).toHaveCount(1);
  });

  test("网络失败显示 failed 状态,重试后成功", async ({ page }) => {
    await page.goto(XHS);
    let failedOnce = false;
    await page.route("**/api/conversations/*/messages", async (route) => {
      if (route.request().method() === "POST" && !failedOnce) {
        failedOnce = true;
        await route.abort("connectionrefused");
        return;
      }
      await route.continue();
    });

    const input = page.getByLabel("创作输入框");
    await input.fill(`网络异常演练 ${Date.now()}`);
    await input.press("Enter");

    await expect(page.getByText(/请求未完成/)).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await expect(page.locator('li[data-role="assistant"][data-status="complete"]').first())
      .toBeVisible({ timeout: 20000 });
  });

  test("非法与私网链接显示可恢复错误,不假装导入", async ({ page }) => {
    await page.goto(XHS);
    const input = page.getByLabel("创作输入框");
    await input.fill(
      "帮我导入 https://user:pass@evil.example/x 和 http://169.254.169.254/latest/meta-data/",
    );
    await input.press("Enter");
    await expect(page.getByText("部分链接无法导入")).toBeVisible({ timeout: 20000 });
    const bodyText = await page.locator("main").innerText();
    expect(bodyText).not.toMatch(LEGACY_PATTERNS);
  });
});
