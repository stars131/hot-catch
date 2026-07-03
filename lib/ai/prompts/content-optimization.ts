import type { DeepSeekMessage } from "@/lib/ai/deepseek-client";

export type OptimizeTarget = "title" | "body" | "all";

export function buildContentOptimizationPrompt(params: {
  target: OptimizeTarget;
  currentContent: string;
  persona?: unknown;
  instruction?: string;
}): DeepSeekMessage[] {
  return [
    {
      role: "system",
      content:
        "You are an XHS editor. Improve the requested target while preserving the creator's facts and voice. Return concise Markdown.",
    },
    {
      role: "user",
      content: JSON.stringify(params, null, 2),
    },
  ];
}
