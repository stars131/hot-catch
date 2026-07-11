import type { ZodType } from "zod";
import { env, isDeepSeekConfigured } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { LlmProvider } from "@/lib/providers/types";
import { safeParseJson } from "@/lib/ai/generate";

type DeepSeekResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

export class DeepSeekProvider implements LlmProvider {
  readonly name = "deepseek";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = env.DEEPSEEK_BASE_URL,
    private readonly model = env.DEEPSEEK_MODEL,
  ) {}

  async generateText(input: {
    system: string;
    prompt: string;
    temperature?: number;
  }) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.PROVIDER_TIMEOUT_MS * 2);
    try {
      const response = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: "system", content: input.system },
              { role: "user", content: input.prompt },
            ],
            temperature: input.temperature ?? 0.6,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        },
      );
      const data = (await response.json().catch(() => null)) as DeepSeekResponse | null;
      if (!response.ok) {
        throw new AppError(
          response.status === 401 || response.status === 403
            ? "CREDENTIAL_INVALID"
            : "AI_GENERATION_FAILED",
          `DeepSeek 请求失败（HTTP ${response.status}）。`,
          response.status === 401 || response.status === 403 ? 422 : 502,
        );
      }
      const content = data?.choices?.[0]?.message?.content?.trim();
      if (!content) throw new AppError("AI_GENERATION_FAILED", "模型返回了空内容。", 502);
      return content;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AppError("AI_GENERATION_FAILED", "DeepSeek 请求超时。", 504);
      }
      throw new AppError("AI_GENERATION_FAILED", "DeepSeek 暂时不可用。", 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  async generateStructured<T>(input: {
    system: string;
    prompt: string;
    schema: ZodType<T>;
    temperature?: number;
  }): Promise<T> {
    const first = await this.generateText(input);
    const firstResult = input.schema.safeParse(safeParseJson(first));
    if (firstResult.success) return firstResult.data;

    const repaired = await this.generateText({
      system: `${input.system}\n你正在修复结构化输出。只返回完整 JSON，不解释。`,
      prompt: `原始输出：\n${first}\n\n校验错误：\n${JSON.stringify(
        firstResult.error.flatten(),
      )}\n\n请按要求修复一次。`,
      temperature: 0.1,
    });
    const repairedResult = input.schema.safeParse(safeParseJson(repaired));
    if (repairedResult.success) return repairedResult.data;
    throw new AppError(
      "AI_GENERATION_FAILED",
      "模型输出连续两次未通过结构校验，已转入人工处理。",
      422,
      repairedResult.error.flatten(),
    );
  }
}

export function createEnvironmentDeepSeekProvider() {
  if (!isDeepSeekConfigured()) {
    throw new AppError("AI_NOT_CONFIGURED", "DeepSeek 尚未配置。", 503);
  }
  return new DeepSeekProvider(env.DEEPSEEK_API_KEY);
}
