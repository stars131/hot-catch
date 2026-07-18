import { expect, test, type Page } from "@playwright/test";
import { defaultContentPublishSettings } from "@/lib/editor/publish-settings";
import { fixtureChecksum } from "./helpers/checksum";

const contentId = "editor-x-content";
const originalPost = "A clear opening post for an X thread.";

const summary = {
  id: contentId,
  title: "How public-source research changes product decisions",
  status: "saved",
  outputType: "x_thread",
  platform: "x",
  contentKind: "x_thread",
  scoreSnapshot: null,
  _count: { revisions: 1, publishRecords: 0 },
  createdAt: "2026-07-18T04:00:00.000Z",
  updatedAt: "2026-07-18T06:00:00.000Z",
};

const revision = {
  id: "editor-x-revision-1",
  revisionNumber: 1,
  source: "generated",
  title: summary.title,
  bodyText: `${originalPost}\n\nA practical second post.`,
  structuredContent: {
    title: summary.title,
    posts: [
      { index: 1, text: originalPost, mediaSuggestion: "Simple source map" },
      { index: 2, text: "A practical second post.", mediaSuggestion: "" },
    ],
    callToAction: "Which source would you verify first?",
    riskNotes: [],
  },
  fullMarkdown: `# ${summary.title}`,
  checksum: fixtureChecksum("editor-checksum-1"),
  provenance: null,
  createdAt: "2026-07-18T06:00:00.000Z",
};

async function mockEditorApis(page: Page, onSettingsSave?: (body: unknown) => void) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/health") {
      return route.fulfill({ json: { dependencies: { database: "ok", redis: "ok" } } });
    }
    if (path === "/api/content/list") {
      return route.fulfill({ json: { contents: [summary] } });
    }
    if (path === `/api/content/${contentId}`) {
      return route.fulfill({ json: {
        content: {
          ...summary,
          tags: [],
          interactionEnding: null,
          riskNotes: null,
          revisions: [revision],
          contentReferences: [],
          directionReviews: [],
          publishRecords: [],
        },
      } });
    }
    if (path === `/api/content/${contentId}/publish-settings`) {
      if (request.method() === "PUT") {
        const body = request.postDataJSON();
        onSettingsSave?.(body);
        return route.fulfill({ json: { settings: body, updatedAt: "2026-07-18T07:00:00.000Z" } });
      }
      return route.fulfill({ json: { settings: defaultContentPublishSettings("x"), updatedAt: null } });
    }
    if (path === `/api/content/${contentId}/revisions`) {
      const body = request.postDataJSON();
      return route.fulfill({ status: 201, json: {
        revision: {
          ...revision,
          ...body,
          id: "editor-x-revision-2",
          revisionNumber: 2,
          source: "manual",
          checksum: fixtureChecksum("editor-checksum-2"),
          createdAt: "2026-07-18T07:00:00.000Z",
        },
      } });
    }
    return route.fulfill({ status: 404, json: { error: { message: `Unhandled mock API: ${path}` } } });
  });
}

test("editor center edits, previews, and saves X publishing settings", async ({ page }) => {
  let savedSettings: Record<string, unknown> | null = null;
  await mockEditorApis(page, (body) => { savedSettings = body as Record<string, unknown>; });
  await page.goto(`/editor?platform=x&contentId=${contentId}`);

  await expect(page.getByRole("heading", { name: "编辑中心" })).toBeVisible();
  await expect(page.getByRole("link", { name: "编辑中心" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("artifact-panel-close")).toHaveCount(0);
  await expect(page.getByTestId("platform-preview")).toContainText(originalPost);

  const updatedPost = "A sharper opening that states the evidence before the conclusion.";
  await page.getByLabel("正文").first().fill(updatedPost);
  await expect(page.getByTestId("platform-preview")).toContainText(updatedPost);

  await page.getByRole("tab", { name: "发布设置" }).click();
  await page.getByLabel("谁可以回复").click();
  await page.getByRole("option", { name: "仅提及的账号" }).click();
  await page.getByLabel("发布时给线程自动编号").click();
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("发布设置已保存")).toBeVisible();
  expect(savedSettings).toMatchObject({ platform: "x", replyPermission: "mentioned", numberThread: true });
  await expect(page.getByText(/导出后手动发布/)).toBeVisible();

  await page.screenshot({ path: "test-results/editor-center-desktop.png", fullPage: true });
});

test("editor center remains usable on a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockEditorApis(page);
  await page.goto(`/editor?platform=x&contentId=${contentId}`);

  await expect(page.getByRole("heading", { name: "编辑中心" })).toBeVisible();
  await expect(page.getByRole("link", { name: "编辑" })).toBeVisible();
  await expect(page.getByLabel("选择发布平台")).toBeVisible();
  await expect(page.getByTestId("platform-preview")).toBeVisible();
  const scrollWidth = await page.evaluate(() => document.scrollingElement?.scrollWidth ?? 0);
  expect(scrollWidth).toBeLessThanOrEqual(390);

  await page.screenshot({ path: "test-results/editor-center-mobile.png", fullPage: true });
});
