import {
  CredentialProvider,
  LlmProviderName,
} from "@prisma/client";
import { AppError } from "@/lib/errors";
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

  // 用户发起的生成任务只能使用该用户保存的凭证。服务器环境变量中的
  // DEEPSEEK_API_KEY 仅供明确的系统级任务使用，不能成为租户间共享兜底。
  return createLlmProviderFor(userId, LlmProviderName.deepseek);
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
