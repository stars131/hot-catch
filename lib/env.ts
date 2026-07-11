import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().optional().default(""),
  AUTH_RESEND_KEY: z.string().optional().default(""),
  AUTH_EMAIL_FROM: z.string().default("星迹内容助手 <noreply@example.com>"),
  DEV_AUTH_BYPASS: z.enum(["0", "1"]).default("1"),
  DEV_MOCK_USER_EMAIL: z.string().email().default("dev@example.com"),
  DEV_MOCK_USER_NAME: z.string().default("Dev User"),
  CREDENTIAL_ENCRYPTION_KEY: z.string().optional().default(""),
  REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().max(20).default(4),
  DEEPSEEK_API_KEY: z.string().optional().default(""),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
  TIKHUB_BASE_URL: z.string().url().default("https://api.tikhub.io"),
  DASHSCOPE_BASE_URL: z
    .string()
    .url()
    .default("https://dashscope.aliyuncs.com/compatible-mode/v1"),
  DASHSCOPE_WORKSPACE_ID: z.string().optional().default(""),
  MEDIA_TEMP_ROOT: z.string().optional().default(""),
  MEDIA_DOWNLOAD_MAX_MB: z.coerce.number().positive().max(1000).default(500),
  AITO_EARN_BASE_URL: z.string().url().default("https://aitoearn.cn"),
  FIRECRAWL_BASE_URL: z.string().url().default("https://api.firecrawl.dev"),
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  XHS_FETCH_PROVIDER: z.enum(["mock", "third_party", "public_page"]).default("mock"),
  XHS_THIRD_PARTY_API_KEY: z.string().optional().default(""),
  XHS_THIRD_PARTY_BASE_URL: z.string().optional().default(""),
  MAX_INPUT_LENGTH: z.coerce.number().int().positive().default(12000),
  MAX_BENCHMARK_ACCOUNTS_PER_ANALYSIS: z.coerce.number().int().positive().default(5),
  XHS_FETCH_CACHE_HOURS: z.coerce.number().int().nonnegative().default(24),
});

export const env = envSchema.parse(process.env);

export type Env = typeof env;

export function isDeepSeekConfigured(): boolean {
  return Boolean(env.DEEPSEEK_API_KEY.trim());
}

export function isDevelopmentAuthBypassEnabled(): boolean {
  return env.NODE_ENV !== "production" && env.DEV_AUTH_BYPASS === "1";
}
