import { AppError } from "@/lib/errors";
import {
  guardCategoryLabel,
  scanOutboundText,
  type GuardField,
  type GuardResult,
} from "@/lib/content/outbound-guard";

/**
 * 出站闸门的服务端部分:补充当前部署的真实密钥值,并在发布入口 fail-closed。
 * 只在服务端调用,浏览器端拿不到这些环境变量。
 */

const SENSITIVE_ENV_NAME = /(?:KEY|SECRET|TOKEN|PASSWORD|COOKIE)$|^(?:DATABASE_URL|REDIS_URL)$/;

export const OUTBOUND_GUARD_FAILURE_CODE = "CONTENT_GUARD_BLOCKED";

/** 当前进程中敏感配置的真实值(长度 ≥ 8),用于精确匹配泄露的真值。 */
export function deploymentSecretLiterals(env: NodeJS.ProcessEnv = process.env): string[] {
  const literals = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (!value || !SENSITIVE_ENV_NAME.test(name)) continue;
    const trimmed = value.trim();
    if (trimmed.length >= 8) literals.add(trimmed);
  }
  return [...literals];
}

export function scanOutboundForPublish(fields: GuardField[]): GuardResult {
  return scanOutboundText(fields, { secretLiterals: deploymentSecretLiterals() });
}

/** 有 block 级命中时抛出 422,details 中只含打码后的摘要。 */
export function assertOutboundContentSafe(fields: GuardField[]): GuardResult {
  const result = scanOutboundForPublish(fields);
  if (!result.blocked) return result;
  const blocks = result.findings.filter((finding) => finding.severity === "block");
  const summary = blocks
    .slice(0, 3)
    .map((finding) => `${finding.fieldLabel}:${finding.hint}`)
    .join(";");
  throw new AppError(
    "VALIDATION_ERROR",
    `发布已拦截:内容中有 ${blocks.length} 处不应公开的信息(${summary})。请在编辑器中修改后再发布。`,
    422,
    {
      reason: "outbound_guard",
      failureCode: OUTBOUND_GUARD_FAILURE_CODE,
      findings: blocks.map((finding) => ({
        category: finding.category,
        categoryLabel: guardCategoryLabel(finding.category),
        field: finding.field,
        fieldLabel: finding.fieldLabel,
        hint: finding.hint,
        excerpt: finding.excerpt,
      })),
    },
  );
}
