import { describe, expect, it } from "vitest";
import {
  contentPublishSettingsSchema,
  defaultContentPublishSettings,
} from "@/lib/editor/publish-settings";
import { PLATFORM_IDS } from "@/lib/platforms/registry";

describe("editor publish settings", () => {
  it("provides a schema-valid platform default for every supported platform", () => {
    for (const platform of PLATFORM_IDS) {
      const settings = defaultContentPublishSettings(platform);
      expect(contentPublishSettingsSchema.parse(settings).platform).toBe(platform);
    }
  });

  it("uses conservative YouTube defaults", () => {
    const settings = defaultContentPublishSettings("youtube");
    expect(settings.visibility).toBe("private");
    expect(settings.audience).toBe("not_made_for_kids");
  });

  it("rejects unknown settings instead of persisting arbitrary provider options", () => {
    expect(() => contentPublishSettingsSchema.parse({
      ...defaultContentPublishSettings("x"),
      unsafeProviderPayload: "do not forward",
    })).toThrow();
  });

  it("requires an offset-aware ISO schedule", () => {
    expect(() => contentPublishSettingsSchema.parse({
      ...defaultContentPublishSettings("reddit"),
      scheduledAt: "2026-07-18T10:00",
    })).toThrow();
  });
});
