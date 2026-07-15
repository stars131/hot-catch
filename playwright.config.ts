import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const SKIP_WEB_SERVER = process.env.E2E_SKIP_WEB_SERVER === "1";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    locale: "zh-CN",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: SKIP_WEB_SERVER ? undefined : {
    command: `npx next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ...process.env,
      DEV_AUTH_BYPASS: "1",
      NODE_ENV: "development",
      FOREIGN_PLATFORM_CREATION_ENABLED: "1",
      UI_I18N_ENABLED: "1",
      URL_GUARD_ALLOWLIST: "127.0.0.1",
      // e2e 固定走本地模拟发布：绝不调用真实 AiToEarn，即使本机存在真实凭证
      PUBLISH_PROVIDER_MODE: "mock",
    },
  },
});
