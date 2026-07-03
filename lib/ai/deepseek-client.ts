import { env, isDeepSeekConfigured } from "@/lib/env";
import { AppError } from "@/lib/errors";

export type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type CallDeepSeekParams = {
  messages: DeepSeekMessage[];
  model?: string;
  temperature?: number;
  stream?: boolean;
  jsonMode?: boolean;
  signal?: AbortSignal;
};

export async function callDeepSeek(
  params: CallDeepSeekParams
): Promise<Response> {
  if (!isDeepSeekConfigured()) {
    throw new AppError(
      "AI_NOT_CONFIGURED",
      "DEEPSEEK_API_KEY is not configured.",
      503
    );
  }

  const baseUrl = env.DEEPSEEK_BASE_URL.replace(/\/$/, "");
  const model = params.model || env.DEEPSEEK_MODEL;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      stream: params.stream ?? false,
      ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: params.signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new AppError(
      "AI_GENERATION_FAILED",
      `DeepSeek API error: ${response.status} ${errorText}`.slice(0, 500),
      502
    );
  }

  return response;
}
