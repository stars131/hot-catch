import { z } from "zod";
import { env } from "@/lib/env";

export const analyzeSchema = z.object({
  accountIds: z
    .array(z.string().cuid())
    .min(1, "Select at least one benchmark account")
    .max(env.MAX_BENCHMARK_ACCOUNTS_PER_ANALYSIS),
  personaId: z.string().cuid().optional().nullable(),
  analysisType: z
    .enum(["single_account", "multiple_accounts", "fusion"])
    .optional(),
  conversationId: z.string().cuid().optional().nullable(),
});

export const generateContentSchema = z.object({
  inputType: z.enum(["topic", "idea", "draft"]).default("topic"),
  inputText: z.string().trim().min(1, "Input text is required").max(env.MAX_INPUT_LENGTH),
  personaId: z.string().cuid().optional().nullable(),
  benchmarkAccountIds: z
    .array(z.string().cuid())
    .max(env.MAX_BENCHMARK_ACCOUNTS_PER_ANALYSIS)
    .optional()
    .default([]),
  outputType: z.string().default("xhs_graphic"),
  conversationId: z.string().cuid().optional().nullable(),
});

export const saveContentSchema = z.object({
  contentId: z.string().cuid().optional(),
  conversationId: z.string().cuid().optional().nullable(),
  personaId: z.string().cuid().optional().nullable(),
  title: z.string().max(200).optional().nullable(),
  inputType: z
    .enum([
      "xhs_id",
      "xhs_profile_url",
      "xhs_note_url",
      "topic",
      "idea",
      "draft",
      "command",
      "unknown",
    ])
    .optional()
    .nullable(),
  inputText: z.string().optional().nullable(),
  fullMarkdown: z.string().optional().nullable(),
  status: z
    .enum(["draft", "saved", "abandoned", "published"])
    .optional()
    .default("saved"),
});

export type AnalyzeRequest = z.infer<typeof analyzeSchema>;
export type GenerateContentRequest = z.infer<typeof generateContentSchema>;
export type SaveContentRequest = z.infer<typeof saveContentSchema>;
