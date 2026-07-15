import { CredentialProvider, LlmProviderName } from "@prisma/client";
import { z } from "zod";
import { isAppError } from "@/lib/errors";
import { LLM_PROVIDER_IDS } from "@/lib/providers/llm-config";
import { assertProviderBaseUrlShape } from "@/lib/providers/provider-url";

export const credentialProviderSchema = z.nativeEnum(CredentialProvider);
export const llmProviderSchema = z.nativeEnum(LlmProviderName);

export const saveCredentialSchema = z
  .object({
    provider: credentialProviderSchema,
    value: z.record(z.string(), z.string().max(20000)).refine(
      (value) => Object.values(value).some((entry) => entry.trim().length > 0),
      "凭证内容不能为空。",
    ),
  })
  .superRefine((input, context) => {
    if (!(LLM_PROVIDER_IDS as readonly string[]).includes(input.provider)) return;
    if (!input.value.apiKey?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value", "apiKey"],
        message: "请填写 API Key。",
      });
    }
    if (!input.value.model?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value", "model"],
        message: "请填写模型名称。",
      });
    }
    if (input.value.baseUrl?.trim()) {
      // 结构级安全校验(协议/内嵌凭证/片段/内网),与自测和运行时共用同一规则。
      try {
        assertProviderBaseUrlShape(input.value.baseUrl);
      } catch (error) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value", "baseUrl"],
          message: isAppError(error) ? error.message : "服务地址不合法。",
        });
      }
    }
  });

export const setDefaultLlmProviderSchema = z.object({
  provider: llmProviderSchema,
});
