import { expect, test, type Page } from "@playwright/test";

const CREATOR_URL = "/creator/xiaohongshu";

function pageWidth(page: Page) {
  return page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
}

test("方向推荐可浏览完整目录，并把主辅方向带入后续创作", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(CREATOR_URL);

  const composer = page.getByLabel("创作输入框");
  await composer.fill(
    `帮我为刚开始健身的上班族写一篇小红书，主题是下班后20分钟居家训练 ${Date.now()}`,
  );
  await composer.press("Enter");

  await expect(page).toHaveURL(/conversationId=/, { timeout: 20_000 });
  const card = page.locator('[data-testid^="card-direction-"]').last();
  await expect(card.getByText("确认表达方向", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(card.getByRole("button", { pressed: true }).first()).toBeVisible();

  await card.getByText("查看更多方向", { exact: true }).click();
  const search = card.getByPlaceholder("搜索 40 个方向");
  await search.fill("步骤");
  await expect(card.getByRole("button", { name: /^步骤教程/ })).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: /^步骤教程/ }).click();
  await card.locator("select").last().selectOption({ label: "检查清单" });
  await expect(card.getByText(/步骤教程 \+ 检查清单/)).toBeVisible();

  await card.getByRole("button", { name: "确认方向", exact: true }).click();
  await expect(page.getByText("方向已处理", { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("方向：步骤教程 + 检查清单", { exact: true })).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("方向已处理", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("方向：步骤教程 + 检查清单", { exact: true })).toBeVisible();
});

test("移动端方向流程无横向溢出，Composer 只显示统一绿色焦点态", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(CREATOR_URL);

  const composer = page.getByLabel("创作输入框");
  await composer.fill(`小红书新手教程，主题是租房收纳 ${Date.now()}`);
  await composer.press("Enter");
  await expect(page.locator('[data-testid^="card-direction-"]').last()).toBeVisible({ timeout: 60_000 });

  await composer.focus();
  const style = await composer.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { boxShadow: computed.boxShadow, border: computed.border };
  });
  expect(style.boxShadow).not.toContain("199, 61, 51");
  expect(style.border).toMatch(/^0px/);

  const width = await pageWidth(page);
  expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth);
});
