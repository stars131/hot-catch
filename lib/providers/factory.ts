import { CredentialProvider } from "@prisma/client";
import { env, isDeepSeekConfigured } from "@/lib/env";
import { AppError, isAppError } from "@/lib/errors";
import { DeepSeekProvider } from "@/lib/providers/deepseek/provider";
import { loadCredential } from "@/lib/services/credential-service";

export async function createLlmProvider(userId: string) {
  try {
    const credential = await loadCredential(userId, CredentialProvider.deepseek);
    const apiKey = credential.apiKey ?? credential.token;
    if (!apiKey) throw new AppError("CREDENTIAL_INVALID", "DeepSeek 凭证缺少 apiKey。", 422);
    return new DeepSeekProvider(
      apiKey,
      credential.baseUrl || env.DEEPSEEK_BASE_URL,
      credential.model || env.DEEPSEEK_MODEL,
    );
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
