import { test, expect } from "@playwright/test";

const corePages = [
  { path: "/hotspots", heading: "热点研究" },
  { path: "/ideas", heading: "选题库" },
  { path: "/publish", heading: "发布中心" },
  { path: "/retrospectives", heading: "数据复盘" },
  { path: "/settings/connections", heading: "连接设置" },
  { path: "/creator/xiaohongshu", heading: "小红书创作" },
  { path: "/creator/douyin", heading: "抖音创作" },
];

test.describe("核心页面冒烟", () => {
  test("首页重定向到小红书工作台", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/creator\/xiaohongshu/);
  });

  for (const { path, heading } of corePages) {
    test(`${path} 正常渲染`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible({ timeout: 30_000 });
    });
  }

  test("健康检查返回依赖状态", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.status).toBe("ready");
    expect(body.dependencies).toEqual({ database: "ok", redis: "ok" });
  });
});
