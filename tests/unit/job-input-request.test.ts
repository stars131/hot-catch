import { describe, expect, it } from "vitest";
import { describeJobInputRequest } from "@/lib/jobs/input-request";

describe("job input request presentation", () => {
  it("keeps API keys out of the inline conversation input", () => {
    const request = describeJobInputRequest({
      reason: "LLM_CREDENTIAL_REQUIRED",
      message: "请先配置默认模型。",
    }, "zh-CN");

    expect(request.kind).toBe("credential");
    expect(request.settingsTarget).toBe("connections");
    expect(request.fieldLabel).toBeUndefined();
    expect(request.requirements).toContain("填写 API Key");
  });

  it("turns structured generation failures into a guided text request", () => {
    const request = describeJobInputRequest({
      reason: "STRUCTURED_OUTPUT_INVALID",
      message: "模型输出连续两次未通过结构校验。",
      diagnostics: {
        kind: "structured_output_invalid",
        attempts: [
          {
            attempt: "repair",
            issues: [
              { path: "pages", code: "too_small", minimum: 3, actual: 2, unit: "array", message: "Too small" },
              { path: "bodyText", code: "too_small", minimum: 100, actual: 42, unit: "string", message: "Too small" },
            ],
            rawOutput: '{"title":"已有草稿","bodyText":"正文内容"}',
          },
        ],
      },
    }, "zh-CN");

    expect(request.kind).toBe("text");
    expect(request.fieldLabel).toContain("可选");
    expect(request.description).toContain("1 次结构检查");
    expect(request.requirements).toContain("不要填写密码或 API Key");
    expect(request.validation?.issues).toEqual([
      "pages：至少 3 项，实际 2 项",
      "bodyText：至少 100 个字符，实际 42 个字符",
    ]);
    expect(request.draftOutput).toContain('"title": "已有草稿"');
    expect(request.canRetryWithoutInput).toBe(true);
  });

  it("routes persona approval to account persona management", () => {
    const request = describeJobInputRequest({ reason: "STYLE_PROFILE_NOT_APPROVED" }, "zh-CN");

    expect(request.kind).toBe("review");
    expect(request.settingsTarget).toBe("personas");
  });
});
