import { env, isDeepSeekConfigured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { OpenAiCompatibleProvider } from "@/lib/providers/openai-compatible/provider";

export class DeepSeekProvider extends OpenAiCompatibleProvider {

  constructor(
    apiKey: string,
    baseUrl = env.DEEPSEEK_BASE_URL,
    model = env.DEEPSEEK_MODEL,
  ) {
    super({
      name: "deepseek",
      displayName: "DeepSeek",
      apiKey,
      baseUrl,
      model,
    });
  }
}

export function createEnvironmentDeepSeekProvider() {
  if (!isDeepSeekConfigured()) {
    throw new AppError("AI_NOT_CONFIGURED", "DeepSeek 尚未配置。", 503);
  }
  return new DeepSeekProvider(env.DEEPSEEK_API_KEY);
}
