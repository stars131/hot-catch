export const LLM_PROVIDER_IDS = ["deepseek", "openai", "grok"] as const;

export type LlmProviderId = (typeof LLM_PROVIDER_IDS)[number];

export type LlmProviderDefinition = {
  id: LlmProviderId;
  name: string;
  company: string;
  purpose: string;
  apiKeyPlaceholder: string;
  defaultBaseUrl: string;
  defaultModel: string;
  docsUrl: string;
};

export const LLM_PROVIDER_DEFINITIONS: Record<
  LlmProviderId,
  LlmProviderDefinition
> = {
  openai: {
    id: "openai",
    name: "ChatGPT",
    company: "OpenAI API",
    purpose: "内容生成、结构化改写和复杂推理",
    apiKeyPlaceholder: "sk-...",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.6",
    docsUrl: "https://developers.openai.com/api/docs/models",
  },
  grok: {
    id: "grok",
    name: "Grok",
    company: "xAI API",
    purpose: "内容生成、知识工作和结构化分析",
    apiKeyPlaceholder: "xai-...",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4.5",
    docsUrl: "https://docs.x.ai/developers/models",
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    company: "DeepSeek API",
    purpose: "内容生成、风格分析和结构化复盘",
    apiKeyPlaceholder: "sk-...",
    defaultBaseUrl: "https://api.deepseek.com",
    defaultModel: "deepseek-chat",
    docsUrl: "https://api-docs.deepseek.com/",
  },
};

export function isLlmProviderId(value: string): value is LlmProviderId {
  return (LLM_PROVIDER_IDS as readonly string[]).includes(value);
}
