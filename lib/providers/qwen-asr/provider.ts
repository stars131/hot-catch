import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import {
  audioFileToDataUrl,
  withTemporaryAudio,
} from "@/lib/media/temporary-audio";
import type {
  TranscriptionInput,
  TranscriptionProvider,
  TranscriptionResult,
} from "@/lib/providers/types";

type QwenResponse = {
  id?: string;
  choices?: Array<{ message?: { content?: string } }>;
};

export class QwenAsrProvider implements TranscriptionProvider {
  readonly name = "qwen-asr";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = env.DASHSCOPE_BASE_URL,
  ) {}

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    return withTemporaryAudio(input.sourceUrl, input.idempotencyKey, async (audio) => {
      const dataUrl = await audioFileToDataUrl(audio.path);
      const response = await fetch(
        `${this.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "qwen3-asr-flash",
            messages: [
              {
                role: "user",
                content: [{ type: "input_audio", input_audio: { data: dataUrl } }],
              },
            ],
            stream: false,
            asr_options: {
              ...(input.language ? { language: input.language } : {}),
              enable_itn: true,
            },
          }),
          signal: AbortSignal.timeout(env.PROVIDER_TIMEOUT_MS * 4),
        },
      );
      const body = (await response.json().catch(() => null)) as QwenResponse | null;
      if (!response.ok) {
        throw new AppError(
          response.status === 401 || response.status === 403
            ? "CREDENTIAL_INVALID"
            : "PROVIDER_ERROR",
          `Qwen-ASR 请求失败（HTTP ${response.status}）。`,
          response.status === 401 || response.status === 403 ? 422 : 502,
        );
      }
      const text = body?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new AppError("PROVIDER_ERROR", "Qwen-ASR 返回了空转写。", 502);
      return { text, segments: [], providerJobId: body?.id, raw: body };
    });
  }
}
