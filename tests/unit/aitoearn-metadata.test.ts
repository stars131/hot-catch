import { describe, expect, it } from "vitest";
import {
  AITOEARN_METADATA,
  AITOEARN_PLATFORM_RULES,
  getAiToEarnPlatformRules,
} from "@/lib/providers/aitoearn/metadata";

describe("AiToEarn metadata & platform rules", () => {
  it("covers exactly the two supported platforms", () => {
    expect(AITOEARN_PLATFORM_RULES.map((rules) => rules.platform)).toEqual([
      "xiaohongshu",
      "douyin",
    ]);
  });

  it("keeps Xiaohongshu image-only and Douyin single-video constraints", () => {
    const xhs = getAiToEarnPlatformRules("xiaohongshu");
    const douyin = getAiToEarnPlatformRules("douyin");
    expect(xhs?.assetTypes).toEqual(["image"]);
    expect(xhs?.minAssets).toBe(1);
    expect(douyin?.assetTypes).toEqual(["video"]);
    expect(douyin?.maxAssets).toBe(1);
  });

  it("exposes connection metadata without any credential fields", () => {
    expect(AITOEARN_METADATA.provider).toBe("aitoearn");
    expect(AITOEARN_METADATA.capabilities).toContain("account_authorization");
    const serialized = JSON.stringify(AITOEARN_METADATA).toLowerCase();
    expect(serialized).not.toContain("apikey");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("secret");
  });
});
