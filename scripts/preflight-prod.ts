/**
 * 生产发布前环境形态自检(只读、不打印任何敏感值)。
 *
 * 在 `docker compose ... up` 之前运行,快速拦截最常见的高危配置错误:
 * - 开发身份旁路未关闭。
 * - 应用/认证地址不是绝对的公网 HTTPS URL。
 * - 认证/加密密钥缺失或强度不足。
 * - 数据库/Redis 连接串缺失。
 * - 凭证加密密钥格式不合法(必须 32 字节:hex64 或 base64)。
 * - 发布被强制成 mock(生产禁止用 mock 掩盖真实发布错误)。
 * - C14 国外平台与界面多语言开关没有显式声明。
 *
 * 刻意不校验任何供应商 API Key:它们是每位用户在连接设置中保存的加密 DB 凭证,
 * 不放进环境变量,也不该出现在部署 env 里。
 *
 * 退出码:全部通过 0;存在阻断项 1。只输出检查项名称与通过/失败,绝不回显取值。
 */

type CheckStatus = "pass" | "fail" | "warn";

type CheckResult = {
  name: string;
  status: CheckStatus;
  message: string;
};

const results: CheckResult[] = [];

function record(name: string, status: CheckStatus, message: string): void {
  results.push({ name, status, message });
}

function isPresent(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** 是否为 32 字节密钥(hex64 或 base64/base64url 解码后 32 字节)。不回显取值。 */
function isValidEncryptionKey(raw: string | undefined): boolean {
  if (!isPresent(raw)) return false;
  const trimmed = raw.trim();
  if (/^[a-f\d]{64}$/i.test(trimmed)) return true;
  try {
    return Buffer.from(trimmed, "base64").length === 32;
  } catch {
    return false;
  }
}

/** 绝对公网 HTTPS URL:https 协议、有主机名、非 localhost/回环/内网命名空间。 */
function isPublicHttpsUrl(raw: string | undefined): boolean {
  if (!isPresent(raw)) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();
  if (!host) return false;
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return false;
  }
  return true;
}

function main(): void {
  const env = process.env;

  // 1. NODE_ENV 必须是 production(否则许多生产强制项不会生效)。
  if (env.NODE_ENV === "production") {
    record("NODE_ENV", "pass", "NODE_ENV=production");
  } else {
    record(
      "NODE_ENV",
      "fail",
      `NODE_ENV 必须为 production,当前为 ${env.NODE_ENV ?? "(未设置)"}。`,
    );
  }

  // 2. 开发身份旁路必须关闭。
  if (env.DEV_AUTH_BYPASS === "0") {
    record("DEV_AUTH_BYPASS", "pass", "开发身份旁路已关闭。");
  } else {
    record(
      "DEV_AUTH_BYPASS",
      "fail",
      "DEV_AUTH_BYPASS 必须显式设为 0(生产禁止免登录旁路)。",
    );
  }

  // 3. 应用与认证地址必须是绝对公网 HTTPS URL。
  if (isPublicHttpsUrl(env.NEXT_PUBLIC_APP_URL)) {
    record("NEXT_PUBLIC_APP_URL", "pass", "应用地址为公网 HTTPS。");
  } else {
    record(
      "NEXT_PUBLIC_APP_URL",
      "fail",
      "NEXT_PUBLIC_APP_URL 必须是绝对公网 HTTPS 地址(非 localhost/内网)。",
    );
  }
  if (isPresent(env.AUTH_URL)) {
    if (isPublicHttpsUrl(env.AUTH_URL)) {
      record("AUTH_URL", "pass", "认证地址为公网 HTTPS。");
    } else {
      record(
        "AUTH_URL",
        "fail",
        "AUTH_URL 必须是绝对公网 HTTPS 地址(非 localhost/内网)。",
      );
    }
  } else {
    record("AUTH_URL", "fail", "AUTH_URL 必须显式设置为公网 HTTPS 地址。");
  }

  // 4. 认证密钥存在且足够强(≥32 字符)。
  if (isPresent(env.AUTH_SECRET) && env.AUTH_SECRET.trim().length >= 32) {
    record("AUTH_SECRET", "pass", "认证密钥已配置且长度充足。");
  } else {
    record(
      "AUTH_SECRET",
      "fail",
      "AUTH_SECRET 缺失或过短(建议 openssl rand -base64 32,至少 32 字符)。",
    );
  }

  // 5. 凭证加密密钥格式合法(32 字节)。
  if (isValidEncryptionKey(env.CREDENTIAL_ENCRYPTION_KEY)) {
    record(
      "CREDENTIAL_ENCRYPTION_KEY",
      "pass",
      "凭证加密密钥格式合法(32 字节)。",
    );
  } else {
    record(
      "CREDENTIAL_ENCRYPTION_KEY",
      "fail",
      "CREDENTIAL_ENCRYPTION_KEY 缺失或格式不正确(需 hex64 或 base64 的 32 字节)。",
    );
  }

  // 6. AUTH_SECRET 与凭证加密密钥不得复用同一取值。
  if (
    isPresent(env.AUTH_SECRET) &&
    isPresent(env.CREDENTIAL_ENCRYPTION_KEY) &&
    env.AUTH_SECRET.trim() === env.CREDENTIAL_ENCRYPTION_KEY.trim()
  ) {
    record(
      "SECRET_REUSE",
      "fail",
      "AUTH_SECRET 与 CREDENTIAL_ENCRYPTION_KEY 不能复用同一取值,请独立生成。",
    );
  } else {
    record("SECRET_REUSE", "pass", "认证与加密密钥未复用。");
  }

  // 7. 数据库连接串存在。
  if (isPresent(env.DATABASE_URL)) {
    record("DATABASE_URL", "pass", "数据库连接串已配置。");
  } else {
    record("DATABASE_URL", "fail", "DATABASE_URL 缺失。");
  }

  // 8. Redis 连接串存在。
  if (isPresent(env.REDIS_URL)) {
    record("REDIS_URL", "pass", "Redis 连接串已配置。");
  } else {
    record("REDIS_URL", "fail", "REDIS_URL 缺失。");
  }

  // 9. 发布模式:生产不得被显式设为 mock。
  if (env.PUBLISH_PROVIDER_MODE === "mock") {
    record(
      "PUBLISH_PROVIDER_MODE",
      "fail",
      "生产禁止 PUBLISH_PROVIDER_MODE=mock(不得用 mock 掩盖真实发布错误)。",
    );
  } else {
    record(
      "PUBLISH_PROVIDER_MODE",
      "pass",
      "发布模式未被强制为 mock(生产代码默认 real)。",
    );
  }

  // 10. 邀请制登录邮件密钥:当前生产认证只支持邮件魔法链接,缺失即不可登录。
  if (isPresent(env.AUTH_RESEND_KEY)) {
    record("AUTH_RESEND_KEY", "pass", "邀请邮件密钥已配置。");
  } else {
    record(
      "AUTH_RESEND_KEY",
      "fail",
      "未设置 AUTH_RESEND_KEY,邀请制魔法链接登录将无法使用。",
    );
  }

  // 11–12. C14 分阶段开关必须显式声明。0 代表 C14A 兼容态,1 代表 C14B 已开放。
  for (const name of [
    "FOREIGN_PLATFORM_CREATION_ENABLED",
    "UI_I18N_ENABLED",
  ] as const) {
    const value = env[name];
    if (value === "1") {
      record(name, "pass", "C14 功能已开启。");
    } else if (value === "0") {
      record(name, "warn", "C14A 兼容态:功能开关仍关闭。进入 C14B 前需改为 1 并重新预检。");
    } else {
      record(name, "fail", "必须显式设置为 0（C14A）或 1（C14B）。");
    }
  }

  const symbol: Record<CheckStatus, string> = {
    pass: "✓",
    warn: "!",
    fail: "✗",
  };
  for (const result of results) {
    process.stdout.write(
      `${symbol[result.status]} ${result.name}: ${result.message}\n`,
    );
  }

  const failures = results.filter((result) => result.status === "fail");
  const warnings = results.filter((result) => result.status === "warn");
  process.stdout.write(
    `\n发布前自检:${results.length} 项,失败 ${failures.length},告警 ${warnings.length}。\n`,
  );
  if (failures.length > 0) {
    process.stdout.write("存在阻断项,请修复后再部署。\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("形态检查通过(不代表供应商凭证或真实服务已验收)。\n");
  }
}

main();
