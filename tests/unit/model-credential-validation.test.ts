import { describe, expect, it } from "vitest";
import { saveCredentialSchema } from "@/lib/validators/credentials";

describe("model credential validation", () => {
  it("accepts a complete ChatGPT configuration", () => {
    expect(
      saveCredentialSchema.safeParse({
        provider: "openai",
        value: {
          apiKey: "sk-test",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-5.6",
        },
      }).success,
    ).toBe(true);
  });

  it("requires a model and valid URL for LLM providers", () => {
    const result = saveCredentialSchema.safeParse({
      provider: "grok",
      value: { apiKey: "xai-test", baseUrl: "not-a-url", model: "" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.value?.join(" ")).toContain(
        "模型名称",
      );
    }
  });

  it.each([
    "http://169.254.169.254/latest/meta-data",
    "https://127.0.0.1/v1",
    "https://metadata.google.internal/v1",
    "ftp://example.com/v1",
    "https://user:pass@example.com/v1",
    "https://example.com/v1?token=secret",
    "https://example.com/v1#fragment",
  ])("rejects unsafe provider base URL %s", (baseUrl) => {
    expect(
      saveCredentialSchema.safeParse({
        provider: "grok",
        value: { apiKey: "xai-test", baseUrl, model: "Grok-4.5" },
      }).success,
    ).toBe(false);
  });

  it("accepts a public OpenAI-compatible endpoint", () => {
    expect(
      saveCredentialSchema.safeParse({
        provider: "grok",
        value: {
          apiKey: "xai-test",
          baseUrl: "https://muxqiao.net/v1",
          model: "Grok-4.5",
        },
      }).success,
    ).toBe(true);
  });
});
