import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { OpenAiCompatibleProvider } from "@/lib/providers/openai-compatible/provider";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAiCompatibleProvider", () => {
  it("uses the configured Chat Completions endpoint and model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "OK" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiCompatibleProvider({
      name: "openai",
      displayName: "ChatGPT",
      apiKey: "sk-test",
      baseUrl: "https://api.openai.com/v1/",
      model: "gpt-5.6",
    });

    await expect(
      provider.generateText({ system: "system", prompt: "prompt" }),
    ).resolves.toBe("OK");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-test",
    );
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe("gpt-5.6");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("response_format");
  });

  it("requests JSON mode and validates structured Grok output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"connected":true}' } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiCompatibleProvider({
      name: "grok",
      displayName: "Grok",
      apiKey: "xai-test",
      baseUrl: "https://api.x.ai/v1",
      model: "grok-4.5",
    });

    await expect(
      provider.generateStructured({
        system: "system",
        prompt: "prompt",
        schema: z.object({ connected: z.boolean() }),
      }),
    ).resolves.toEqual({ connected: true });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.temperature).toBe(0.6);
  });

  it("retains field-level diagnostics and the unsaved draft after repair fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '{"connected":"yes"}' } }],
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: '{"connected":"still-not-a-boolean"}' } }],
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAiCompatibleProvider({
      name: "deepseek",
      displayName: "DeepSeek",
      apiKey: "sk-test",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });

    let failure: unknown;
    try {
      await provider.generateStructured({
        system: "Return JSON only.",
        prompt: "Test",
        schema: z.object({ connected: z.boolean() }),
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      code: "AI_GENERATION_FAILED",
      statusCode: 422,
      details: {
        kind: "structured_output_invalid",
        attempts: [
          {
            attempt: "initial",
            issues: [{ path: "connected", code: "invalid_type" }],
            rawOutput: '{"connected":"yes"}',
          },
          {
            attempt: "repair",
            issues: [{ path: "connected", code: "invalid_type" }],
            rawOutput: '{"connected":"still-not-a-boolean"}',
          },
        ],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("redacts upstream bodies and credentials from failures", async () => {
    const secret = "sk-should-never-escape";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(`upstream debug body contains ${secret}`, { status: 500 }),
      ),
    );
    const provider = new OpenAiCompatibleProvider({
      name: "grok",
      displayName: "Grok",
      apiKey: secret,
      baseUrl: "http://127.0.0.1:4567/v1",
      model: "Grok-4.5",
    });

    let error: unknown;
    try {
      await provider.generateText({ system: "system", prompt: "prompt" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("HTTP 500");
    expect((error as Error).message).not.toContain(secret);
    expect((error as Error).message).not.toContain("upstream debug body");
  });

  it("normalizes aborted requests as timeouts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("secret upstream detail", "AbortError")),
    );
    const provider = new OpenAiCompatibleProvider({
      name: "openai",
      displayName: "ChatGPT",
      apiKey: "sk-test",
      baseUrl: "http://localhost:4567/v1",
      model: "gpt-5.6",
    });

    await expect(
      provider.generateText({ system: "system", prompt: "prompt" }),
    ).rejects.toMatchObject({ statusCode: 504, message: "ChatGPT 请求超时。" });
  });

  it("suppresses a rejected stream cancellation after an aborted read", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new DOMException("read aborted", "AbortError"));
      },
      cancel() {
        return Promise.reject(new DOMException("cancel aborted", "AbortError"));
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const provider = new OpenAiCompatibleProvider({
      name: "deepseek",
      displayName: "DeepSeek",
      apiKey: "sk-test",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
    });

    await expect(
      provider.generateText({ system: "system", prompt: "prompt" }),
    ).rejects.toMatchObject({ statusCode: 504, message: "DeepSeek 请求超时。" });
    await Promise.resolve();
  });
});
