import type { DeepSeekMessage } from "@/lib/ai/deepseek-client";

export type AccountAnalysisResult = {
  positioning?: string;
  targetAudience?: string;
  frequentTopics?: string[];
  titlePatterns?: string[];
  coverStyle?: string;
  contentStructure?: string;
  languageStyle?: string;
  interactionStyle?: string;
  personaExpression?: string;
  learnablePoints?: string[];
  avoidPoints?: string[];
  userAdaptation?: string;
  fullReport?: string;
};

export function buildAccountAnalysisPrompt(params: {
  account: unknown;
  notes: unknown[];
  persona?: unknown;
}): DeepSeekMessage[] {
  return [
    {
      role: "system",
      content:
        "Analyze one XHS benchmark account. Return JSON with positioning, audience, topics, patterns, learnable points, avoid points, adaptation, and fullReport.",
    },
    { role: "user", content: JSON.stringify(params, null, 2) },
  ];
}
