import type { ZodType } from "zod";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { safeParseJson } from "@/lib/ai/generate";
import type { LlmProvider } from "@/lib/providers/types";
import type { LlmProviderId } from "@/lib/providers/llm-config";
import { assertProviderBaseUrlReachable } from "@/lib/providers/provider-url";

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

type ProviderOptions = {
  name: LlmProviderId;
  displayName: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

/** 上游响应正文读取上限:防止恶意/异常端点返回超大 body 拖垮 Worker。 */
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: LlmProviderId;
  readonly model: string;
  private readonly displayName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  /** 首次请求时完成一次 baseUrl 安全复检(含 DNS),后续请求复用结果。 */
  private verifiedBaseUrl: string | null = null;

  constructor(options: ProviderOptions) {
    this.name = options.name;
    this.displayName = options.displayName;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl;
    this.model = options.model;
  }

  async generateText(input: {
    system: string;
    prompt: string;
    temperature?: number;
  }) {
    return this.request(input, false);
  }

  async generateStructured<T>(input: {
    system: string;
    prompt: string;
    schema: ZodType<T>;
    temperature?: number;
  }): Promise<T> {
    const first = await this.request(input, true);
    const firstResult = input.schema.safeParse(safeParseJson(first));
    if (firstResult.success) return firstResult.data;

    const repaired = await this.request(
      {
        system: `${input.system}\n你正在修复结构化输出。只返回完整 JSON，不解释。`,
        prompt: `原始输出：\n${first}\n\n校验错误：\n${JSON.stringify(
          firstResult.error.flatten(),
        )}\n\n请按要求修复一次。`,
        temperature: 0.1,
      },
      true,
    );
    const repairedResult = input.schema.safeParse(safeParseJson(repaired));
    if (repairedResult.success) return repairedResult.data;
    throw new AppError(
      "AI_GENERATION_FAILED",
      "模型输出连续两次未通过结构校验，已转入人工处理。",
      422,
      repairedResult.error.flatten(),
    );
  }

  private async request(
    input: { system: string; prompt: string; temperature?: number },
    jsonMode: boolean,
  ) {
    // 发请求前做一次集中式安全复检:阻断被改写成内网/私网的 baseUrl(SSRF)。
    // 结构校验在保存时已做过,这里额外补一次 DNS 解析复检;
    // 同一 provider 实例内(如结构化修复的第二次请求)复用首次结果,避免重复解析。
    if (this.verifiedBaseUrl === null) {
      this.verifiedBaseUrl = await assertProviderBaseUrlReachable(this.baseUrl);
    }
    const safeBaseUrl = this.verifiedBaseUrl;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      env.PROVIDER_TIMEOUT_MS,
    );
    try {
      const response = await fetch(
        `${safeBaseUrl.replace(/\/$/, "")}/chat/completions`,
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
            ...(this.supportsTemperature()
              ? { temperature: input.temperature ?? 0.6 }
              : {}),
            ...(jsonMode
              ? { response_format: { type: "json_object" } }
              : {}),
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        // 只保留状态码等可诊断信息;绝不回传上游响应体、堆栈或请求头。
        const credentialError = response.status === 401 || response.status === 403;
        void response.body?.cancel();
        throw new AppError(
          credentialError ? "CREDENTIAL_INVALID" : "AI_GENERATION_FAILED",
          `${this.displayName} 请求失败（HTTP ${response.status}）。`,
          credentialError ? 422 : 502,
        );
      }
      const raw = await this.readCapped(response);
      let data: ChatCompletionResponse | null;
      try {
        data = raw ? (JSON.parse(raw) as ChatCompletionResponse) : null;
      } catch {
        throw new AppError(
          "AI_GENERATION_FAILED",
          `${this.displayName} 返回了无法解析的响应。`,
          502,
        );
      }
      const content = data?.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new AppError("AI_GENERATION_FAILED", "模型返回了空内容。", 502);
      }
      return content;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AppError(
          "AI_GENERATION_FAILED",
          `${this.displayName} 请求超时。`,
          504,
        );
      }
      // 网络错误信息可能包含地址/端口等细节,统一归一化,不透传原始 message。
      throw new AppError(
        "AI_GENERATION_FAILED",
        `${this.displayName} 暂时不可用。`,
        502,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /** 读取响应体并限制大小,防止超大响应拖垮内存。 */
  private async readCapped(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_RESPONSE_BYTES) {
          void reader.cancel();
          throw new AppError(
            "AI_GENERATION_FAILED",
            `${this.displayName} 返回内容过大,已终止读取。`,
            502,
          );
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      void reader.cancel();
      throw error;
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  private supportsTemperature() {
    return !(this.name === "openai" && this.model.startsWith("gpt-5"));
  }
}
