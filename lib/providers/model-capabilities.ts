import { LLM_PROVIDER_DEFINITIONS, type LlmProviderId } from "@/lib/providers/llm-config";

export type ModelCapabilities = {
  provider: LlmProviderId;
  model: string;
  structuredOutput: boolean;
  streaming: boolean;
  vision: boolean;
  tools: boolean;
  contextWindow: number;
};

export function modelCapabilities(provider: LlmProviderId, model = LLM_PROVIDER_DEFINITIONS[provider].defaultModel): ModelCapabilities {
  const normalized = model.toLowerCase();
  if (provider === "deepseek") {
    return { provider, model, structuredOutput: true, streaming: true, vision: normalized.includes("vision"), tools: true, contextWindow: 128_000 };
  }
  if (provider === "grok") {
    return { provider, model, structuredOutput: true, streaming: true, vision: true, tools: true, contextWindow: 256_000 };
  }
  return { provider, model, structuredOutput: true, streaming: true, vision: !normalized.includes("mini"), tools: true, contextWindow: 400_000 };
}
