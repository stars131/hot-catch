/**
 * URL 识别与规范化(客户端/服务端共用,无 Node 依赖)。
 *
 * - 只接受 http/https;file、ftp、javascript、data 等协议一律拒绝。
 * - 移除已知跟踪参数;保留业务参数(如小红书 xsec_token 保留,防止链接失效)。
 * - 识别国内两平台、五个国外平台及普通网页。
 */

import type { PlatformId } from "@/lib/platforms/registry";

export type DetectedUrl = {
  raw: string;
  normalized: string;
  platform: PlatformId | "web";
  kind: "content" | "account" | "webpage";
};

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "spm",
  "spm_id_from",
  "share_token",
  "share_app_id",
  "share_link_id",
  "gclid",
  "fbclid",
  "igshid",
  "vd_source",
  "app_platform",
  "share_from",
  "wxshare_count",
  "timestamp",
]);

const URL_PATTERN = /https?:\/\/[^\s<>"'()【】,，。;;]+/gi;

export class InvalidUrlError extends Error {
  constructor(message: string, readonly url: string) {
    super(message);
    this.name = "InvalidUrlError";
  }
}

/** 从自由文本中提取全部候选 URL(保持出现顺序,去重)。 */
export function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const match of matches) {
    const trimmed = match.replace(/[.,;!?、」』】)]+$/u, "");
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/** 校验协议并规范化;非法直接抛 InvalidUrlError(可恢复错误)。 */
export function normalizeUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new InvalidUrlError("链接格式无法解析。", raw);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new InvalidUrlError(`不支持 ${parsed.protocol.replace(":", "")} 协议,只允许 http/https。`, raw);
  }
  if (parsed.username || parsed.password) {
    throw new InvalidUrlError("不支持携带账号信息的链接。", raw);
  }
  parsed.hash = "";
  const params = new URLSearchParams(parsed.search);
  for (const key of [...params.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) params.delete(key);
  }
  parsed.search = params.toString() ? `?${params.toString()}` : "";
  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString();
}

export function detectUrl(raw: string): DetectedUrl {
  const normalized = normalizeUrl(raw);
  const hostname = new URL(normalized).hostname;
  const pathname = new URL(normalized).pathname;

  if (hostname.endsWith("xiaohongshu.com") || hostname.endsWith("xhslink.com")) {
    const isAccount = /\/user\/profile\//.test(pathname);
    return {
      raw,
      normalized,
      platform: "xiaohongshu",
      kind: isAccount ? "account" : "content",
    };
  }
  if (hostname.endsWith("douyin.com") || hostname.endsWith("iesdouyin.com")) {
    const isAccount = /\/user\//.test(pathname) && !/\/video\//.test(pathname);
    return {
      raw,
      normalized,
      platform: "douyin",
      kind: isAccount ? "account" : "content",
    };
  }
  if (
    hostname === "youtu.be" ||
    hostname === "youtube.com" ||
    hostname.endsWith(".youtube.com")
  ) {
    const isAccount = /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?$/i.test(
      pathname,
    );
    return { raw, normalized, platform: "youtube", kind: isAccount ? "account" : "content" };
  }
  if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) {
    const isAccount = /^\/@[^/]+\/?$/i.test(pathname);
    return { raw, normalized, platform: "tiktok", kind: isAccount ? "account" : "content" };
  }
  if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) {
    const isContent = /^\/(?:p|reel|reels|tv)\//i.test(pathname);
    return { raw, normalized, platform: "instagram", kind: isContent ? "content" : "account" };
  }
  if (
    hostname === "x.com" ||
    hostname.endsWith(".x.com") ||
    hostname === "twitter.com" ||
    hostname.endsWith(".twitter.com")
  ) {
    const isContent = /\/status\/\d+/i.test(pathname);
    return { raw, normalized, platform: "x", kind: isContent ? "content" : "account" };
  }
  if (hostname === "reddit.com" || hostname.endsWith(".reddit.com")) {
    const isContent = /\/comments\//i.test(pathname);
    return { raw, normalized, platform: "reddit", kind: isContent ? "content" : "account" };
  }
  return { raw, normalized, platform: "web", kind: "webpage" };
}

/** 提取并检测文本中的 URL;返回合法结果与不合法明细,调用方展示可恢复错误。 */
export function detectUrlsInText(text: string, limit = 3): {
  detected: DetectedUrl[];
  invalid: Array<{ url: string; reason: string }>;
} {
  const detected: DetectedUrl[] = [];
  const invalid: Array<{ url: string; reason: string }> = [];
  for (const raw of extractUrls(text)) {
    try {
      detected.push(detectUrl(raw));
    } catch (error) {
      invalid.push({
        url: raw,
        reason: error instanceof InvalidUrlError ? error.message : "链接无法解析。",
      });
    }
    if (detected.length >= limit) break;
  }
  return { detected, invalid };
}
