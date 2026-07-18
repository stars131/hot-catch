export type JobInputRequest = {
  kind: "credential" | "text" | "review";
  title: string;
  description: string;
  requirements: string[];
  validation?: {
    summary: string;
    issues: string[];
  };
  draftOutput?: string;
  draftLabel?: string;
  canRetryWithoutInput?: boolean;
  fieldLabel?: string;
  placeholder?: string;
  settingsTarget?: "connections" | "personas";
};

export function describeJobInputRequest(
  output: unknown,
  locale: string,
): JobInputRequest {
  const value = asRecord(output);
  const reason = typeof value.reason === "string" ? value.reason : "UNKNOWN";
  const message = typeof value.message === "string" ? value.message : "";
  const zh = locale === "zh-CN";

  if (reason === "LLM_CREDENTIAL_REQUIRED") {
    return {
      kind: "credential",
      title: zh ? "需要配置一个可用的默认模型" : "A working default model is required",
      description: message || (zh ? "模型连接完成后可以从当前任务继续。" : "Continue this task after the model connection is ready."),
      requirements: zh
        ? ["选择模型服务商", "填写 API Key", "确认模型名称", "测试连接并设为默认模型"]
        : ["Choose a provider", "Enter an API key", "Confirm the model name", "Test it and make it the default"],
      settingsTarget: "connections",
    };
  }

  if (reason === "QWEN_ASR_CREDENTIAL_REQUIRED" || reason === "TIKHUB_CREDENTIAL_REQUIRED") {
    const provider = reason === "QWEN_ASR_CREDENTIAL_REQUIRED" ? "Qwen-ASR" : "TikHub";
    return {
      kind: "credential",
      title: zh ? `需要配置 ${provider}` : `${provider} must be configured`,
      description: message || (zh ? "凭证只在独立连接页面输入。" : "Credentials are entered only on the dedicated connections page."),
      requirements: zh
        ? [`填写 ${provider} API Key`, "保存并测试连接", "返回此任务继续"]
        : [`Enter the ${provider} API key`, "Save and test the connection", "Return and continue this task"],
      settingsTarget: "connections",
    };
  }

  if (reason === "STYLE_PROFILE_NOT_APPROVED") {
    return {
      kind: "review",
      title: zh ? "需要先确认当前账号人设" : "The current account persona needs approval",
      description: message || (zh ? "确认账号定位和表达边界后再继续生成。" : "Review the account positioning and expression boundaries before generation."),
      requirements: zh
        ? ["检查身份、受众和表达风格", "确认边界与禁区", "激活要用于本次创作的版本"]
        : ["Review identity, audience and style", "Confirm boundaries and exclusions", "Activate the version for this creation"],
      settingsTarget: "personas",
    };
  }

  if (reason === "MEDIA_URL_REQUIRED") {
    return {
      kind: "text",
      title: zh ? "需要可访问的视频地址" : "An accessible video URL is required",
      description: message || (zh ? "请提供原视频的公开下载或播放地址。" : "Provide a public download or playback URL for the source video."),
      requirements: zh ? ["以 https:// 开头", "无需登录即可访问"] : ["Starts with https://", "Accessible without signing in"],
      fieldLabel: zh ? "视频地址" : "Video URL",
      placeholder: "https://…",
    };
  }

  if (reason === "STRUCTURED_OUTPUT_INVALID") {
    const diagnostics = asRecord(value.diagnostics);
    const attempts = Array.isArray(diagnostics.attempts)
      ? diagnostics.attempts.map(asRecord).filter((item) => Object.keys(item).length > 0)
      : [];
    const latestAttempt = attempts.at(-1) ?? {};
    const rawIssues = Array.isArray(latestAttempt.issues)
      ? latestAttempt.issues.map(asRecord).filter((item) => Object.keys(item).length > 0)
      : [];
    const issues = rawIssues.slice(0, 12).map((issue) => formatValidationIssue(issue, zh));
    const rawOutput = typeof latestAttempt.rawOutput === "string"
      ? latestAttempt.rawOutput
      : "";
    const issueCount = rawIssues.length;

    return {
      kind: "text",
      title: zh ? "草稿已生成，但结构检查未通过" : "A draft was generated, but structure checks failed",
      description: attempts.length
        ? zh
          ? `已完成 ${attempts.length} 次结构检查和自动修复；下方列出最后一次检查结果。草稿尚未保存为作品。`
          : `${attempts.length} structure checks and automatic repair attempts ran. The latest result is shown below; the draft has not been saved as content.`
        : message || (zh ? "模型返回了内容，但旧任务没有保存字段级诊断。请重新生成以获取完整检查结果。" : "The model returned content, but this older task did not retain field-level diagnostics. Retry to collect a complete report."),
      requirements: zh
        ? ["可以先查看模型返回的未保存草稿", "可直接按原要求重试，也可以补充修改方向", "不要填写密码或 API Key"]
        : ["Review the unsaved model draft first", "Retry unchanged or add optional guidance", "Do not enter passwords or API keys"],
      ...(issues.length
        ? {
            validation: {
              summary: zh
                ? `最后一次检查发现 ${issueCount} 项字段问题${issueCount > issues.length ? `，显示前 ${issues.length} 项` : ""}`
                : `The latest check found ${issueCount} field issue${issueCount === 1 ? "" : "s"}${issueCount > issues.length ? `; showing the first ${issues.length}` : ""}`,
              issues,
            },
          }
        : {}),
      ...(rawOutput
        ? {
            draftOutput: prettyModelOutput(rawOutput),
            draftLabel: zh ? "模型返回的未保存草稿" : "Unsaved model draft",
          }
        : {}),
      canRetryWithoutInput: true,
      fieldLabel: zh ? "补充要求（可选）" : "Additional guidance (optional)",
      placeholder: zh ? "例如：正文保留现有观点，补足 3 页图文结构，并控制标题在 40 字以内。" : "For example: preserve the current points, add at least three pages, and keep the title under 40 characters.",
    };
  }

  return {
    kind: "text",
    title: zh ? "需要补充生成要求" : "More generation guidance is required",
    description: message || (zh ? "补充目标、必须保留的内容或希望调整的方向。" : "Add the target, required details, or the direction to adjust."),
    requirements: zh
      ? ["说明希望修正的内容", "列出必须保留的信息", "不要填写密码或 API Key"]
      : ["Describe what should change", "List information that must remain", "Do not enter passwords or API keys"],
    fieldLabel: zh ? "补充信息" : "Additional guidance",
    placeholder: zh ? "例如：保留产品参数，语气更克制，并避免绝对化表达。" : "For example: preserve the product facts, use a restrained tone, and avoid absolute claims.",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function formatValidationIssue(
  issue: Record<string, unknown>,
  zh: boolean,
): string {
  const path = typeof issue.path === "string" ? issue.path : "$";
  const code = typeof issue.code === "string" ? issue.code : "custom";
  const message = typeof issue.message === "string" ? issue.message : "";
  const expected = typeof issue.expected === "string" ? issue.expected : undefined;
  const received = typeof issue.received === "string" ? issue.received : undefined;
  const minimum = typeof issue.minimum === "number" ? issue.minimum : undefined;
  const maximum = typeof issue.maximum === "number" ? issue.maximum : undefined;
  const actual = typeof issue.actual === "number" || typeof issue.actual === "string"
    ? issue.actual
    : undefined;
  const unit = typeof issue.unit === "string" ? issue.unit : undefined;

  if (code === "invalid_json") {
    return zh ? `${path}：不是有效 JSON` : `${path}: not valid JSON`;
  }
  if (code === "invalid_type" && expected && received) {
    return zh
      ? `${path}：需要 ${expected}，实际为 ${received}`
      : `${path}: expected ${expected}, received ${received}`;
  }
  if (code === "too_small" && minimum !== undefined) {
    return zh
      ? `${path}：至少 ${minimum}${unitLabel(unit, true)}${actual === undefined ? "" : `，实际 ${actual}${unitLabel(unit, true)}`}`
      : `${path}: minimum ${minimum}${unitLabel(unit, false)}${actual === undefined ? "" : `, actual ${actual}${unitLabel(unit, false)}`}`;
  }
  if (code === "too_big" && maximum !== undefined) {
    return zh
      ? `${path}：最多 ${maximum}${unitLabel(unit, true)}${actual === undefined ? "" : `，实际 ${actual}${unitLabel(unit, true)}`}`
      : `${path}: maximum ${maximum}${unitLabel(unit, false)}${actual === undefined ? "" : `, actual ${actual}${unitLabel(unit, false)}`}`;
  }
  return `${path}：${message || (zh ? "未通过校验" : "validation failed")}`;
}

function unitLabel(unit: string | undefined, zh: boolean): string {
  if (!zh) return unit === "array" ? " items" : unit === "string" ? " characters" : "";
  return unit === "array" ? " 项" : unit === "string" ? " 个字符" : "";
}

function prettyModelOutput(raw: string): string {
  const text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  const candidate = start >= 0 && end > start ? fenced.slice(start, end + 1) : fenced;
  try {
    return JSON.stringify(JSON.parse(candidate), null, 2);
  } catch {
    return raw;
  }
}
