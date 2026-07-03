import type { XhsFetchInput } from "@/lib/xhs/types";

const RE_PROFILE = /xiaohongshu\.com\/user\/profile\/([\w-]+)/i;
const RE_NOTE = /xiaohongshu\.com\/(?:explore|discovery\/item)\/([\w-]+)/i;
const RE_SHORT = /xhslink\.com/i;

export function extractUrl(input: string): string | null {
  const match = input.match(/https?:\/\/[^\s)]+/i);
  return match?.[0] ?? null;
}

export function resolveXhsInput(rawInput: string): XhsFetchInput | null {
  const input = rawInput.trim();
  if (!input) return null;

  const maybeUrl = extractUrl(input) ?? input;
  if (RE_PROFILE.test(maybeUrl)) {
    return { type: "profile_url", value: maybeUrl };
  }
  if (RE_NOTE.test(maybeUrl) || RE_SHORT.test(maybeUrl)) {
    return { type: "note_url", value: maybeUrl };
  }

  const xhsId = input.replace(/^@/, "").replace(/^xhs[:：]/i, "").trim();
  if (xhsId && xhsId.length <= 40 && !/\s/.test(xhsId) && !xhsId.includes("/")) {
    return { type: "xhs_id", value: xhsId };
  }

  return null;
}

export function extractProfileId(url: string): string | undefined {
  return url.match(RE_PROFILE)?.[1];
}

export function extractNoteId(url: string): string | undefined {
  return url.match(RE_NOTE)?.[1];
}

export function isAllowedXhsUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    return (
      ["http:", "https:"].includes(url.protocol) &&
      (host === "xiaohongshu.com" ||
        host.endsWith(".xiaohongshu.com") ||
        host === "xhslink.com" ||
        host.endsWith(".xhslink.com"))
    );
  } catch {
    return false;
  }
}

export async function resolveShortLink(shortUrl: string): Promise<string | null> {
  return isAllowedXhsUrl(shortUrl) ? shortUrl : null;
}
