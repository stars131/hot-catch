import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://xhs:xhs_password@127.0.0.1:5432/xhs_benchmark?schema=public",
      REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
      DEV_AUTH_BYPASS: "0",
      CREDENTIAL_ENCRYPTION_KEY:
        process.env.CREDENTIAL_ENCRYPTION_KEY ??
        "BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=",
      TIKHUB_BASE_URL: "https://tikhub.test",
      URL_GUARD_ALLOWLIST: "web.test,tikhub.test",
    },
  },
});
