import type { DeepSeekMessage } from "@/lib/ai/deepseek-client";

export type ContentGenerationResult = {
  titles?: string[];
  coverTexts?: string[];
  pages?: { page: number; text: string }[];
  body?: string;
  tags?: string[];
  interactionEnding?: string;
  benchmarkExplanation?: string;
  riskNotes?: string;
  optimizeDirections?: string;
  fullMarkdown?: string;
};

export function buildContentGenerationPrompt(params: {
  inputType: "topic" | "idea" | "draft";
  inputText: string;
  persona?: unknown;
  benchmarkAccounts?: unknown[];
  benchmarkAnalyses?: unknown[];
}): DeepSeekMessage[] {
  return [
    {
      role: "system",
      content:
        "You are an XHS content strategist. Return JSON only with titles, coverTexts, pages, body, tags, interactionEnding, benchmarkExplanation, riskNotes, optimizeDirections, and fullMarkdown.",
    },
    {
      role: "user",
      content: JSON.stringify(params, null, 2),
    },
  ];
}
