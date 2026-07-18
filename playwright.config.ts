import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const WORKER_READY_PORT = Number(process.env.E2E_WORKER_READY_PORT ?? PORT + 1);
const SKIP_WEB_SERVER = process.env.E2E_SKIP_WEB_SERVER === "1";
const EXECUTABLE_PATH = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const LOOPBACK_NO_PROXY = "127.0.0.1,localhost,::1";

// Playwright's readiness probe honors proxy variables. Keep loopback traffic local
// so a developer proxy cannot turn a healthy E2E server into a 502 response.
process.env.NO_PROXY = [process.env.NO_PROXY, LOOPBACK_NO_PROXY].filter(Boolean).join(",");
process.env.no_proxy = [process.env.no_proxy, LOOPBACK_NO_PROXY].filter(Boolean).join(",");

const E2E_ENV = {
  ...process.env,
  DEV_AUTH_BYPASS: "1",
  NODE_ENV: "development",
  FOREIGN_PLATFORM_CREATION_ENABLED: "1",
  UI_I18N_ENABLED: "1",
  URL_GUARD_ALLOWLIST: "127.0.0.1",
  E2E_WORKER_READY_PORT: String(WORKER_READY_PORT),
  // E2E 始终使用本地模拟发布，不调用真实 AiToEarn。
  PUBLISH_PROVIDER_MODE: "mock",
};

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
  projects: [{
    name: "chromium",
    use: {
      ...devices["Desktop Chrome"],
      ...(EXECUTABLE_PATH ? { executablePath: EXECUTABLE_PATH } : {}),
    },
  }],
  webServer: SKIP_WEB_SERVER ? undefined : [
    {
      name: "Web",
      command: `npx next dev -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: E2E_ENV,
    },
    {
      name: "Worker",
      command: "npm run worker",
      port: WORKER_READY_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      env: E2E_ENV,
    },
  ],
});
