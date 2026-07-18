import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CredentialProvider, LlmProviderName } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createLlmProvider } from "@/lib/providers/factory";
import {
  deleteCredential,
  getDefaultLlmProvider,
  saveCredential,
  setDefaultLlmProvider,
} from "@/lib/services/credential-service";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userId = "";
let isolatedUserId = "";

beforeAll(async () => {
  const [user, isolatedUser] = await Promise.all([
    prisma.user.create({ data: { email: `llm-settings-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `llm-isolated-${runId}@example.com` } }),
  ]);
  userId = user.id;
  isolatedUserId = isolatedUser.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userId, isolatedUserId] } } });
  await prisma.$disconnect();
});

describe("LLM provider settings", () => {
  it("never falls back to a server model key for a user without credentials", async () => {
    await expect(createLlmProvider(isolatedUserId)).rejects.toMatchObject({
      code: "CREDENTIAL_NOT_CONFIGURED",
    });
  });

  it("selects the first saved model and resolves its configured model", async () => {
    await saveCredential(userId, CredentialProvider.openai, {
      apiKey: `sk-${runId}`,
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.6",
    });

    expect(await getDefaultLlmProvider(userId)).toBe(LlmProviderName.openai);
    const provider = await createLlmProvider(userId);
    expect(provider.name).toBe("openai");
    expect(provider.model).toBe("gpt-5.6");
  });

  it("switches the default and rotates it when that credential is removed", async () => {
    await saveCredential(userId, CredentialProvider.grok, {
      apiKey: `xai-${runId}`,
      baseUrl: "https://api.x.ai/v1",
      model: "grok-4.5",
    });
    await setDefaultLlmProvider(userId, LlmProviderName.grok);
    expect(await getDefaultLlmProvider(userId)).toBe(LlmProviderName.grok);

    await deleteCredential(userId, CredentialProvider.grok);
    expect(await getDefaultLlmProvider(userId)).toBe(LlmProviderName.openai);
  });
});
