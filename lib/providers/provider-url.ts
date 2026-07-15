import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@/lib/errors";
import {
  isBlockedHostname,
  isBlockedIp,
  isLoopbackHost,
} from "@/lib/security/url-guard";

/**
 * LLM 供应商服务地址(baseUrl)的集中式安全校验。
 *
 * 设置保存、连接自测和运行时生成共用同一套规则,避免各处零散的字符串前缀判断:
 * - 只允许 http/https;拒绝 file/ftp/javascript/data 等协议。
 * - 拒绝内嵌账号密码(user:pass@)与片段(#...)。
 * - 生产环境强制 HTTPS。
 * - 拒绝 localhost、回环、链路本地、私网与云元数据地址(IP 字面量与主机名两条路径)。
 * - 开发/测试环境仅在显式需要时放行 http 回环(本地自建模型服务)。
 *
 * `assertProviderBaseUrlShape` 为同步结构校验(供 Zod 与构造函数使用,不触网);
 * `assertProviderBaseUrlReachable` 追加一次 DNS 解析复检(供运行时真正发请求前使用),
 * 阻断解析到私网的主机名。合法公网 OpenAI 兼容端点(如 https://muxqiao.net/v1)不受影响。
 */

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** 结构校验:返回去除首尾空白后的 URL 字符串。失败抛 VALIDATION_ERROR。 */
export function assertProviderBaseUrlShape(rawUrl: string): string {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) {
    throw new AppError("VALIDATION_ERROR", "服务地址不能为空。", 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AppError("VALIDATION_ERROR", "服务地址必须是完整 URL。", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new AppError("VALIDATION_ERROR", "服务地址只支持 http/https 协议。", 400);
  }
  if (parsed.username || parsed.password) {
    throw new AppError("VALIDATION_ERROR", "服务地址不能内嵌账号或密码。", 400);
  }
  if (parsed.hash) {
    throw new AppError("VALIDATION_ERROR", "服务地址不能包含片段(#)。", 400);
  }
  if (parsed.search) {
    throw new AppError("VALIDATION_ERROR", "服务地址不能包含查询参数。", 400);
  }
  if (isProduction() && parsed.protocol !== "https:") {
    throw new AppError("VALIDATION_ERROR", "生产环境的服务地址必须使用 HTTPS。", 400);
  }

  const hostname = parsed.hostname.toLowerCase();
  const bareHost = hostname.replace(/^\[|\]$/g, "");
  const allowLoopback = !isProduction() && parsed.protocol === "http:";

  if (isIP(bareHost)) {
    if (isBlockedIp(bareHost)) {
      if (allowLoopback && isLoopbackHost(bareHost)) return trimmed;
      throw new AppError(
        "VALIDATION_ERROR",
        "服务地址指向内网或受限网络,已拒绝保存。",
        400,
      );
    }
    return trimmed;
  }

  if (isBlockedHostname(hostname)) {
    if (allowLoopback && isLoopbackHost(hostname)) return trimmed;
    throw new AppError(
      "VALIDATION_ERROR",
      "服务地址指向本地或内部命名空间,已拒绝保存。",
      400,
    );
  }

  return trimmed;
}

/** 运行时复检:结构校验 + 一次 DNS 解析,阻断解析到私网的主机名。 */
export async function assertProviderBaseUrlReachable(
  rawUrl: string,
): Promise<string> {
  const normalized = assertProviderBaseUrlShape(rawUrl);
  const { hostname, protocol } = new URL(normalized);
  const bareHost = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // IP 字面量已在结构校验中分类;放行的回环(dev)无需再解析。
  if (isIP(bareHost)) return normalized;
  if (!isProduction() && protocol === "http:" && isLoopbackHost(bareHost)) {
    return normalized;
  }

  let addresses;
  try {
    addresses = await lookup(bareHost, { all: true, verbatim: true });
  } catch {
    throw new AppError("VALIDATION_ERROR", "服务地址的域名无法解析。", 400);
  }
  if (!addresses.length || addresses.some((address) => isBlockedIp(address.address))) {
    throw new AppError(
      "VALIDATION_ERROR",
      "服务地址解析到受限网络地址,已拒绝访问。",
      400,
    );
  }
  return normalized;
}
