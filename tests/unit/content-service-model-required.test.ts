import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    generatedContent: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/services/persona-service", () => ({
  getEffectivePersona: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/services/benchmark-service", () => ({
  getAccountsWithNotes: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/services/skill-service", () => ({
  resolveConversationSkills: vi.fn().mockResolvedValue({
    ids: [],
    snapshots: [],
    promptInstruction: "",
  }),
  skillSnapshotsJson: vi.fn(),
}));

vi.mock("@/lib/providers/factory", () => ({
  createLlmProvider: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { createLlmProvider } from "@/lib/providers/factory";
import {
  generateContent,
  optimizeContent,
} from "@/lib/services/content-service";

const missingCredential = () =>
  new AppError(
    "CREDENTIAL_NOT_CONFIGURED",
    "deepseek 凭证未配置或已失效。",
    422,
  );

describe("content service model requirements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects generation instead of returning a local-template draft", async () => {
    vi.mocked(createLlmProvider).mockRejectedValueOnce(missingCredential());

    await expect(
      generateContent({
        userId: "user-1",
        inputType: "topic",
        inputText: "测试主题",
        skillIds: ["skill-1", "skill-2"],
      }),
    ).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
      statusCode: 422,
      message:
        "未配置可用的默认生成模型，请先前往“连接设置”保存模型凭证并设为默认模型。",
    });

    expect(prisma.generatedContent.create).not.toHaveBeenCalled();
  });

  it("rejects optimization instead of returning a local note", async () => {
    vi.mocked(createLlmProvider).mockRejectedValueOnce(missingCredential());

    await expect(
      optimizeContent({
        userId: "user-1",
        target: "body",
        currentContent: "原始内容",
      }),
    ).rejects.toMatchObject({
      code: "AI_NOT_CONFIGURED",
      statusCode: 422,
    });
  });
});
