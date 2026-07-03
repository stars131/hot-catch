export const PROMPT_VERSION = {
  INTENT_PARSE: "intent_parse_v1",
  ACCOUNT_ANALYSIS: "account_analysis_v1",
  FUSION_ANALYSIS: "fusion_analysis_v1",
  CONTENT_GENERATION: "content_generation_v1",
  CONTENT_OPTIMIZATION: "content_optimization_v1",
} as const;

export type PromptVersionKey = keyof typeof PROMPT_VERSION;
