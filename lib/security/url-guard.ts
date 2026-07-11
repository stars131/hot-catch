import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "@/lib/errors";
import { normalizeUrl } from "@/lib/creator/url-detection";

/**
 * 服务端 URL 安全防护(SSRF)。
 *
 * - 只允许 http/https(normalizeUrl 已保证)。
 * - 拒绝 localhost、私网/链路本地/回环 IP、云元数据地址;DNS 解析结果同样校验。
 * - safeFetchText:重定向逐跳复检(≤3 次)、响应大小上限、超时控制。
 * - 外部正文一律视为不可信数据,调用方不得将其拼入系统指令。
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
]);

const DEV_ALLOWLIST = new Set(
  process.env.NODE_ENV !== "production"
    ? (process.env.URL_GUARD_ALLOWLIST ?? "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    : [],
);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // 链路本地 / 云元数据
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // 组播与保留
  );
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) return isPrivateIPv4(lower.slice(7));
  return false;
}

function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true;
}

/** 校验 URL 可安全访问;返回规范化后的 URL。失败抛 VALIDATION_ERROR。 */
export async function assertUrlSafe(rawUrl: string): Promise<string> {
  const normalized = normalizeUrl(rawUrl);
  const { hostname } = new URL(normalized);

  if (DEV_ALLOWLIST.has(hostname)) return normalized;

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new AppError("VALIDATION_ERROR", "该链接指向内部地址,已拒绝访问。", 400);
  }

  if (isIP(hostname.replace(/^\[|\]$/g, ""))) {
    if (isBlockedIp(hostname.replace(/^\[|\]$/g, ""))) {
      throw new AppError("VALIDATION_ERROR", "该链接指向私有网络地址,已拒绝访问。", 400);
    }
    return normalized;
  }

  let addresses;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new AppError("VALIDATION_ERROR", "链接域名无法解析。", 400);
  }
  if (!addresses.length || addresses.some((address) => isBlockedIp(address.address))) {
    throw new AppError("VALIDATION_ERROR", "链接解析到受限网络地址,已拒绝访问。", 400);
  }
  return normalized;
}

export type SafeFetchResult = {
  finalUrl: string;
  status: number;
  contentType: string;
  /** 截断后的正文文本(不可信外部内容) */
  text: string;
  truncated: boolean;
};

const MAX_REDIRECTS = 3;

/**
 * 安全抓取文本内容:逐跳 SSRF 复检、大小与超时限制。
 * Firecrawl 未配置时的基础网页兜底,以及短链解析都走这里。
 */
export async function safeFetchText(
  rawUrl: string,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<SafeFetchResult> {
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 15000;

  let currentUrl = await assertUrlSafe(rawUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; StartraceBot/1.0; reference-import)",
          Accept: "text/html,text/plain,application/xhtml+xml",
        },
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === "AbortError") {
        throw new AppError("PROVIDER_ERROR", "抓取超时,请稍后重试。", 504);
      }
      throw new AppError("PROVIDER_ERROR", "链接无法访问。", 502);
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      clearTimeout(timer);
      const location = response.headers.get("location");
      if (!location) throw new AppError("PROVIDER_ERROR", "重定向缺少目标地址。", 502);
      if (redirects === MAX_REDIRECTS) {
        throw new AppError("VALIDATION_ERROR", "重定向次数过多,已停止跟踪。", 400);
      }
      // 每一跳都重新做 SSRF 校验,阻断跳向私网的危险重定向
      currentUrl = await assertUrlSafe(new URL(location, currentUrl).toString());
      continue;
    }

    try {
      if (!response.ok) {
        throw new AppError("PROVIDER_ERROR", `抓取失败(HTTP ${response.status})。`, 502);
      }
      const contentType = response.headers.get("content-type") ?? "";
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > maxBytes) {
        throw new AppError("VALIDATION_ERROR", "响应内容过大,已拒绝抓取。", 400);
      }
      const reader = response.body?.getReader();
      if (!reader) {
        return { finalUrl: currentUrl, status: response.status, contentType, text: "", truncated: false };
      }
      const chunks: Uint8Array[] = [];
      let received = 0;
      let truncated = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          truncated = true;
          void reader.cancel();
          break;
        }
        chunks.push(value);
      }
      const text = Buffer.concat(chunks).toString("utf8");
      return { finalUrl: currentUrl, status: response.status, contentType, text, truncated };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new AppError("VALIDATION_ERROR", "重定向次数过多,已停止跟踪。", 400);
}

/** 从 HTML 提取标题与粗略正文(不可信数据,仅作摘要来源)。 */
export function extractHtmlSummary(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([^<]{0,300})<\/title>/i);
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return {
    title: titleMatch?.[1]?.trim() ?? "",
    text: withoutScripts.slice(0, 20000),
  };
}
