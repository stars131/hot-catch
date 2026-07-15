const JOB_ERROR_MESSAGE_KEYS: Record<string, string> = {
  CREDENTIAL_INVALID: "errors.credentialInvalid",
  CREDENTIAL_NOT_CONFIGURED: "errors.credentialRequired",
  AI_NOT_CONFIGURED: "errors.credentialRequired",
  AI_GENERATION_FAILED: "errors.generationFailed",
  PROVIDER_ERROR: "errors.provider",
  DEPENDENCY_UNAVAILABLE: "errors.provider",
  QUEUE_UNAVAILABLE: "errors.provider",
  XHS_MANUAL_REQUIRED: "errors.referenceBlocked",
};

const SAFE_JOB_ERROR_MESSAGES: Record<string, string> = {
  "errors.credentialInvalid": "模型凭证无效或已失效，请更新后重试。",
  "errors.credentialRequired": "请先配置可用的模型凭证。",
  "errors.generationFailed": "模型未返回符合平台格式的内容。",
  "errors.provider": "外部服务暂时不可用，请稍后重试。",
  "errors.referenceBlocked": "链接抓取受阻，请粘贴你有权使用的摘要。",
  "errors.jobFailed": "任务执行失败，请重试。",
};

export function jobErrorMessageKey(errorCode: string | null): string | null {
  if (!errorCode) return null;
  return JOB_ERROR_MESSAGE_KEYS[errorCode] ?? "errors.jobFailed";
}

export function safeJobErrorMessage(messageKey: string | null): string | null {
  if (!messageKey) return null;
  return SAFE_JOB_ERROR_MESSAGES[messageKey] ?? SAFE_JOB_ERROR_MESSAGES["errors.jobFailed"];
}
