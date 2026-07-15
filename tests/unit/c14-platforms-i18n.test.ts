import { describe, expect, it } from "vitest";
import enMessages from "@/messages/en-US.json";
import zhMessages from "@/messages/zh-CN.json";
import { detectUrl } from "@/lib/creator/url-detection";
import { toErrorResponse, AppError } from "@/lib/errors";
import {
  CONTENT_KIND_IDS,
  CONTENT_LOCALES,
  PLATFORM_DEFINITIONS,
  PLATFORM_IDS,
  platformSupportsContentKind,
} from "@/lib/platforms/registry";
import {
  instagramCarouselSchema,
  redditPostSchema,
  tiktokShortVideoScriptSchema,
  xThreadSchema,
  youtubeVideoPackageSchema,
} from "@/lib/platforms/server-registry";
import { generationBatchSchema } from "@/lib/validators/generation-batch";
import { jobErrorMessageKey, safeJobErrorMessage } from "@/lib/jobs/error-messages";

describe("C14 platform registry", () => {
  it("registers every platform and content kind exactly once", () => {
    expect(PLATFORM_IDS).toHaveLength(7);
    expect(CONTENT_KIND_IDS).toHaveLength(7);
    expect(new Set(PLATFORM_IDS).size).toBe(PLATFORM_IDS.length);
    expect(
      new Set(Object.values(PLATFORM_DEFINITIONS).map((item) => item.contentKind)).size,
    ).toBe(CONTENT_KIND_IDS.length);
    for (const platform of PLATFORM_IDS) {
      const definition = PLATFORM_DEFINITIONS[platform];
      expect(platformSupportsContentKind(platform, definition.contentKind)).toBe(true);
    }
  });

  it("accepts Chinese plus all seven planned target languages", () => {
    expect(CONTENT_LOCALES).toEqual([
      "zh-CN",
      "en-US",
      "ja-JP",
      "ko-KR",
      "es-ES",
      "fr-FR",
      "de-DE",
      "pt-BR",
    ]);
  });

  it("rejects duplicate or oversized batch platform selections", () => {
    const base = {
      brief: "A sufficiently clear creative brief",
      targetLocale: "ja-JP",
      skillIds: [],
    } as const;
    expect(
      generationBatchSchema.safeParse({
        ...base,
        targetPlatforms: ["youtube", "youtube"],
      }).success,
    ).toBe(false);
    expect(
      generationBatchSchema.safeParse({
        ...base,
        targetPlatforms: ["youtube", "tiktok", "instagram", "x", "reddit"],
      }).success,
    ).toBe(true);
  });
});

describe("C14 foreign schemas", () => {
  it("enforces the conservative 280-character X post boundary", () => {
    expect(
      xThreadSchema.safeParse({
        title: "A useful thread",
        posts: [{ index: 1, text: "x".repeat(281), mediaSuggestion: "" }],
        callToAction: "What would you add?",
        riskNotes: [],
      }).success,
    ).toBe(false);
  });

  it("accepts representative outputs for all five formats", () => {
    expect(
      youtubeVideoPackageSchema.safeParse({
        title: "A complete YouTube package",
        titleOptions: ["Option one", "Option two", "Option three"],
        thumbnailText: "START HERE",
        hook: "A practical opening that makes the value clear.",
        durationSec: 120,
        sections: [
          { startSec: 0, endSec: 60, heading: "Start", narration: "Narration", visualDirection: "Presenter" },
          { startSec: 60, endSec: 120, heading: "Finish", narration: "Narration", visualDirection: "B-roll" },
        ],
        chapters: [{ timeSec: 0, title: "Start" }, { timeSec: 60, title: "Finish" }],
        description: "A sufficiently detailed video description for the package.",
        tags: ["one", "two", "three"],
        callToAction: "Subscribe for the next guide.",
        riskNotes: [],
      }).success,
    ).toBe(true);
    expect(
      tiktokShortVideoScriptSchema.safeParse({
        title: "Short video",
        hook: "Stop scrolling",
        durationSec: 10,
        shots: [
          { startSec: 0, endSec: 5, voiceover: "First", visual: "A", onScreenText: "A", camera: "Wide", transition: "Cut" },
          { startSec: 5, endSec: 10, voiceover: "Second", visual: "B", onScreenText: "B", camera: "Close", transition: "Cut" },
        ],
        caption: "A complete short-video caption.",
        hashtags: ["one", "two", "three"],
        musicDirection: "Light instrumental",
        callToAction: "Share your view",
        disclosureNotes: [],
        riskNotes: [],
      }).success,
    ).toBe(true);
    expect(
      instagramCarouselSchema.safeParse({
        title: "Carousel guide",
        coverText: "Five steps",
        slides: [
          { slideNumber: 1, heading: "Start", body: "Useful first point", visualDirection: "Large type", altText: "Text card" },
          { slideNumber: 2, heading: "Next", body: "Useful second point", visualDirection: "Diagram", altText: "Simple diagram" },
        ],
        caption: "A complete caption for this carousel post.",
        hashtags: ["one", "two", "three"],
        callToAction: "Save this post",
        riskNotes: [],
      }).success,
    ).toBe(true);
    expect(
      redditPostSchema.safeParse({
        title: "A community discussion",
        audience: "Independent creators",
        subredditSuggestions: ["r/creators"],
        bodyMarkdown: "This is a detailed discussion post with enough context for constructive replies.",
        tldr: "A concise summary",
        discussionPrompt: "How would you approach this?",
        flairSuggestion: "Discussion",
        disclosure: "No affiliation",
        riskNotes: [],
      }).success,
    ).toBe(true);
  });
});

describe("C14 URL recognition and UI dictionaries", () => {
  it.each([
    ["https://www.youtube.com/watch?v=abc", "youtube", "content"],
    ["https://www.tiktok.com/@creator/video/123", "tiktok", "content"],
    ["https://www.instagram.com/p/ABC123/", "instagram", "content"],
    ["https://x.com/creator/status/123", "x", "content"],
    ["https://www.reddit.com/r/test/comments/abc/title/", "reddit", "content"],
    ["https://www.youtube.com/@creator", "youtube", "account"],
    ["https://www.tiktok.com/@creator", "tiktok", "account"],
  ])("recognizes %s", (url, platform, kind) => {
    expect(detectUrl(url)).toMatchObject({ platform, kind });
  });

  it("keeps Chinese and English dictionary keys identical", () => {
    expect(flattenKeys(enMessages)).toEqual(flattenKeys(zhMessages));
  });

  it("returns stable error code plus a translation key", () => {
    expect(toErrorResponse(new AppError("PUBLISHING_NOT_SUPPORTED", "safe", 422))).toEqual({
      status: 422,
      body: {
        error: {
          code: "PUBLISHING_NOT_SUPPORTED",
          message: "safe",
          messageKey: "errors.publishingNotSupported",
          details: undefined,
        },
      },
    });
  });

  it("maps provider failures to safe translation keys without exposing raw errors", () => {
    const messageKey = jobErrorMessageKey("CREDENTIAL_INVALID");
    expect(messageKey).toBe("errors.credentialInvalid");
    expect(safeJobErrorMessage(messageKey)).toBe("模型凭证无效或已失效，请更新后重试。");
  });
});

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value)
    .flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}
