import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import fixture from "@/tests/fixtures/qwen-asr/transcription.json";

vi.mock("@/lib/media/temporary-audio", () => ({
  withTemporaryAudio: async (
    _sourceUrl: string,
    _key: string,
    callback: (audio: { path: string }) => Promise<unknown>,
  ) => callback({ path: "fixture.mp3" }),
  audioFileToDataUrl: async () => "data:audio/mpeg;base64,SUQzRklYVFVSRQ==",
}));

import { QwenAsrProvider } from "@/lib/providers/qwen-asr/provider";

const apiKey = "dashscope-secret-fixture";
let submitted: Record<string, unknown> | null = null;
const server = setupServer(
  http.post("https://dashscope.test/compatible-mode/v1/chat/completions", async ({ request }) => {
    if (request.headers.get("Authorization") !== `Bearer ${apiKey}`) {
      return new HttpResponse(null, { status: 401 });
    }
    submitted = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(fixture);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => { server.resetHandlers(); submitted = null; });
afterAll(() => server.close());

describe("Qwen-ASR provider contract", () => {
  it("submits the documented audio message and returns text", async () => {
    const provider = new QwenAsrProvider(apiKey, "https://dashscope.test/compatible-mode/v1");
    const result = await provider.transcribe({
      sourceUrl: "https://media.example/video.mp4",
      language: "zh",
      idempotencyKey: "fixture-video",
    });
    expect(submitted).toMatchObject({ model: "qwen3-asr-flash", stream: false });
    expect(JSON.stringify(submitted)).toContain("data:audio/mpeg;base64");
    expect(result).toMatchObject({
      providerJobId: "chatcmpl-asr-fixture",
      text: "先给结论，再用三个具体步骤解释，最后提醒观众收藏。",
    });
    expect(JSON.stringify(result)).not.toContain(apiKey);
  });
});
