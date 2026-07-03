import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  NEXT_PUBLIC_APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().default("dev-only-secret"),
  DEV_MOCK_USER_EMAIL: z.string().email().default("dev@example.com"),
  DEV_MOCK_USER_NAME: z.string().default("Dev User"),
  DEEPSEEK_API_KEY: z.string().optional().default(""),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),
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
