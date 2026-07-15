import {
  CredentialProvider,
  LlmProviderName,
} from "@prisma/client";
import { env, isDeepSeekConfigured } from "@/lib/env";
import { AppError, isAppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { DeepSeekProvider } from "@/lib/providers/deepseek/provider";
import { LLM_PROVIDER_DEFINITIONS } from "@/lib/providers/llm-config";
import { OpenAiCompatibleProvider } from "@/lib/providers/openai-compatible/provider";
import { loadCredential } from "@/lib/services/credential-service";

export async function createLlmProvider(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultLlmProvider: true },
  });
  const preferred = user?.defaultLlmProvider;
  if (preferred) return createLlmProviderFor(userId, preferred);

  try {
    return await createLlmProviderFor(userId, LlmProviderName.deepseek);
  } catch (error) {
    if (
      isAppError(error) &&
      error.code === "CREDENTIAL_NOT_CONFIGURED" &&
      isDeepSeekConfigured()
    ) {
      return new DeepSeekProvider(env.DEEPSEEK_API_KEY);
    }
    throw error;
  }
}

export async function createLlmProviderFor(
  userId: string,
  provider: LlmProviderName,
) {
  const credentialProvider = provider as CredentialProvider;
  const credential = await loadCredential(userId, credentialProvider);
  const apiKey = credential.apiKey ?? credential.token;
  const definition = LLM_PROVIDER_DEFINITIONS[provider];
  if (!apiKey) {
    throw new AppError(
      "CREDENTIAL_INVALID",
      `${definition.name} 凭证缺少 API Key。`,
      422,
    );
  }
  const baseUrl = credential.baseUrl || definition.defaultBaseUrl;
  const model = credential.model || definition.defaultModel;
  if (provider === LlmProviderName.deepseek) {
    return new DeepSeekProvider(apiKey, baseUrl, model);
  }
  return new OpenAiCompatibleProvider({
    name: provider,
    displayName: definition.name,
    apiKey,
    baseUrl,
    model,
  });
}
