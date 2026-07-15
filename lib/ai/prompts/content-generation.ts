import type { DeepSeekMessage } from "@/lib/ai/deepseek-client";
import { z } from "zod";

export const contentGenerationResultSchema = z.object({
  titles: z.array(z.string()).optional(),
  coverTexts: z.array(z.string()).optional(),
  pages: z.array(z.object({ page: z.number(), text: z.string() })).optional(),
  body: z.string().optional(),
  tags: z.array(z.string()).optional(),
  interactionEnding: z.string().optional(),
  benchmarkExplanation: z.string().optional(),
  riskNotes: z.string().optional(),
  optimizeDirections: z.string().optional(),
  fullMarkdown: z.string().optional(),
});

export type ContentGenerationResult = z.infer<
  typeof contentGenerationResultSchema
>;

export function buildContentGenerationPrompt(params: {
  inputType: "topic" | "idea" | "draft";
  inputText: string;
  persona?: unknown;
  benchmarkAccounts?: unknown[];
  benchmarkAnalyses?: unknown[];
  skillInstruction?: string;
}): DeepSeekMessage[] {
  return [
    {
      role: "system",
      content:
        "You are an XHS content strategist. Return JSON only with titles, coverTexts, pages, body, tags, interactionEnding, benchmarkExplanation, riskNotes, optimizeDirections, and fullMarkdown." +
        (params.skillInstruction ? `\n\n${params.skillInstruction}` : ""),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          inputType: params.inputType,
          inputText: params.inputText,
          persona: params.persona,
          benchmarkAccounts: params.benchmarkAccounts,
          benchmarkAnalyses: params.benchmarkAnalyses,
        },
        null,
        2,
      ),
    },
  ];
}
