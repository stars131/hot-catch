import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname) } },
  test: {
    environment: "node",
    include: ["tests/contract/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/startrace_contract",
      DEV_AUTH_BYPASS: "0",
      TIKHUB_BASE_URL: "https://tikhub.test",
      DASHSCOPE_BASE_URL: "https://dashscope.test/compatible-mode/v1",
    },
  },
});
