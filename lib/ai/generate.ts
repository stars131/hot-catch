import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { AppError, isAppError } from "@/lib/errors";
import { callDeepSeek, type DeepSeekMessage } from "@/lib/ai/deepseek-client";

export type GenerateParams = {
  messages: DeepSeekMessage[];
  promptType: string;
  promptVersion?: string;
  userId?: string;
  temperature?: number;
  jsonMode?: boolean;
  maxRetries?: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateText(params: GenerateParams): Promise<string> {
  const started = Date.now();
  let lastError: unknown;
  const maxRetries = params.maxRetries ?? 2;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await callDeepSeek({
        messages: params.messages,
        temperature: params.temperature,
        jsonMode: params.jsonMode,
      });
      const data = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = data.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) {
        throw new AppError("AI_GENERATION_FAILED", "The model returned empty content.", 502);
      }
      await logAiCall({
        userId: params.userId,
        promptType: params.promptType,
        promptVersion: params.promptVersion,
        status: "success",
        latencyMs: Date.now() - started,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      });
      return content;
    } catch (error) {
      lastError = error;
      if (isAppError(error) && error.code === "AI_NOT_CONFIGURED") {
        await logAiCall({
          userId: params.userId,
          promptType: params.promptType,
          promptVersion: params.promptVersion,
          status: "skipped",
          latencyMs: Date.now() - started,
          errorMessage: error.message,
        });
        throw error;
      }
      if (attempt < maxRetries) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  await logAiCall({
    userId: params.userId,
    promptType: params.promptType,
    promptVersion: params.promptVersion,
    status: "failed",
    latencyMs: Date.now() - started,
    errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
  });

  throw new AppError(
    "AI_GENERATION_FAILED",
    "AI generation failed. Please retry later.",
    502
  );
}

export function safeParseJson<T>(raw: string): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    text = text.slice(start, end + 1);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError("AI_GENERATION_FAILED", "The model returned invalid JSON.", 502);
  }
}

export async function generateJson<T>(params: GenerateParams): Promise<T> {
  const content = await generateText({ ...params, jsonMode: true });
  return safeParseJson<T>(content);
}

async function logAiCall(data: {
  userId?: string;
  promptType: string;
  promptVersion?: string;
  status: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  errorMessage?: string;
}) {
  try {
    await prisma.aiCallLog.create({
      data: {
        userId: data.userId,
        provider: "deepseek",
        modelName: env.DEEPSEEK_MODEL,
        promptType: data.promptType,
        promptVersion: data.promptVersion,
        status: data.status,
        latencyMs: data.latencyMs,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        errorMessage: data.errorMessage?.slice(0, 1000),
      },
    });
  } catch {
    // AI call logging is non-critical.
  }
}
