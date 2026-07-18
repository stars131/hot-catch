import { z } from "zod";

const maxResultsSchema = z.number().int().min(10).max(100).default(30);
const usernameSchema = z
  .string()
  .trim()
  .regex(/^@?[A-Za-z0-9_]{1,15}$/, "X 用户名格式不正确。")
  .transform((value) => value.replace(/^@/, ""));

export const xDiscoveryInputSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("region"),
    woeid: z.number().int().positive().max(2_147_483_647),
    regionName: z.string().trim().min(1).max(100).optional(),
    regionQuery: z.string().trim().min(1).max(200).optional(),
    maxResults: z.number().int().min(1).max(50).default(20),
  }),
  z.object({
    mode: z.literal("topic"),
    query: z.string().trim().min(1).max(300),
    language: z.string().trim().regex(/^[a-z]{2,5}$/).optional(),
    maxResults: maxResultsSchema,
  }),
  z.object({
    mode: z.literal("accounts"),
    usernames: z.array(usernameSchema).min(1).max(10).transform((values) => [...new Set(values)]),
    maxResults: maxResultsSchema,
  }),
]);

export type XDiscoveryInput = z.infer<typeof xDiscoveryInputSchema>;
