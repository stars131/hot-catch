import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const auditPages = [
  { path: "/hotspots", heading: "热点研究" },
  { path: "/ideas", heading: "选题库" },
  { path: "/publish", heading: "发布中心" },
  { path: "/retrospectives", heading: "数据复盘" },
  { path: "/settings/connections", heading: "连接设置" },
  { path: "/creator/xiaohongshu", heading: "小红书创作" },
];

test.describe("可访问性 @a11y", () => {
  for (const { path, heading } of auditPages) {
    test(`${path} 无严重可访问性问题`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible({ timeout: 30_000 });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const blocking = results.violations.filter((violation) =>
        ["critical", "serious"].includes(violation.impact ?? ""),
      );
      expect(
        blocking.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.slice(0, 3).map((node) => node.target),
        })),
      ).toEqual([]);
    });
  }
});
