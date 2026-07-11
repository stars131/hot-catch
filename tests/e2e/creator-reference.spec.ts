import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

const XHS = "/creator/xiaohongshu";
const FIXTURE_PORT = 4655;
const articleHtml = readFileSync(
  path.resolve(__dirname, "../fixtures/web/article.html"),
  "utf8",
);

let fixtureServer: Server;

test.beforeAll(async () => {
  fixtureServer = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(articleHtml);
  });
  await new Promise<void>((resolve) => fixtureServer.listen(FIXTURE_PORT, "127.0.0.1", resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => fixtureServer.close(() => resolve()));
});

test.describe("C4 链接导入与参考生成(桌面 1440×900)", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("粘贴网页链接 → ReferenceCard → 导入完成 → 证据/选题/一键生成", async ({ page }) => {
    test.setTimeout(120000);
    const fixtureUrl = `http://127.0.0.1:${FIXTURE_PORT}/article-${Date.now()}`;

    await page.goto(XHS);
    const input = page.getByLabel("创作输入框");
    await input.fill(`帮我参考这条 ${fixtureUrl}`);
    await input.press("Enter");

    // ReferenceCard 出现并由 Worker 处理到 ready
    const card = page.locator('[data-testid^="card-reference-"]');
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card).toHaveAttribute("data-state", "ready", { timeout: 45000 });

    // 查看证据:输出结构、事实与边界(来自脱敏 Brief)
    await card.getByRole("button", { name: "查看证据" }).click();
    await expect(page.getByText("内容结构:")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("不可模仿边界:")).toBeVisible();

    // 提炼为选题
    await card.getByRole("button", { name: "提炼为选题" }).click();
    await expect(
      page.getByText(/已提炼为选题|不再重复创建|已经保存为选题/),
    ).toBeVisible({ timeout: 20000 });

    // 一键生成原创稿:创建生成任务;无 DeepSeek 凭证时进度卡如实显示等待输入
    await card.getByRole("button", { name: "参考结构生成原创稿" }).click();
    const progress = page.locator('[data-testid^="card-progress-"]');
    await expect(progress).toBeVisible({ timeout: 20000 });
    await expect(
      progress.getByText(/需要你补充信息|正在|排队/).first(),
    ).toBeVisible({ timeout: 45000 });

    // 刷新:卡片状态与动作结果全部从数据库恢复
    await page.reload();
    await expect(page.locator('[data-testid^="card-reference-"]').first()).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByText("内容结构:")).toBeVisible({ timeout: 20000 });
    await expect(page.locator('[data-testid^="card-progress-"]').first()).toBeVisible();

    // 重复点击防护:生成按钮已标记已处理
    await expect(
      page.locator('[data-testid^="card-reference-"]').first().getByRole("button", {
        name: /已处理|参考结构生成原创稿/,
      }).first(),
    ).toBeDisabled();
  });
});
