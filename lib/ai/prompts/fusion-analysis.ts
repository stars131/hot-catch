import type { DeepSeekMessage } from "@/lib/ai/deepseek-client";

export type FusionAnalysisResult = {
  sharedPatterns?: string[];
  perAccountStrength?: Record<string, unknown>[];
  topicIdeas?: string[];
  fusionStrategy?: string;
  fullReport?: string;
};

export function buildFusionAnalysisPrompt(params: {
  accounts: unknown[];
  persona?: unknown;
}): DeepSeekMessage[] {
  return [
    {
      role: "system",
      content:
        "Compare multiple XHS benchmark accounts. Return JSON with sharedPatterns, perAccountStrength, topicIdeas, fusionStrategy, and fullReport.",
    },
    { role: "user", content: JSON.stringify(params, null, 2) },
  ];
}
