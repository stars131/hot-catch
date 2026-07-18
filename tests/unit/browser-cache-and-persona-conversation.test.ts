import { describe, expect, it } from "vitest";
import { parseHotspotBrowserCache } from "@/lib/hotspots/browser-cache";
import { PERSONA_CONVERSATION_STEPS, createPersonaDraft } from "@/lib/personas/conversation";

describe("browser hotspot cache", () => {
  it("accepts a valid cached payload and rejects malformed data", () => {
    const payload = {
      generatedAt: "2026-07-17T00:00:00.000Z",
      platforms: ["全平台"],
      topics: [],
      sourceHealth: [],
      sourceCatalog: [],
      projectReferences: [],
      summary: {
        totalItems: 0,
        activeSources: 0,
        crossPlatformTopics: 0,
        backendCount: 0,
        credentialFreeSourceCount: 0,
        optionalConnectionSourceCount: 0,
        cookieSourceCount: 0,
        cookieConfiguredCount: 0,
        projectReferenceCount: 0,
        source: "test",
      },
    };

    expect(parseHotspotBrowserCache(JSON.stringify({ storedAt: 123, payload })))
      .toMatchObject({ storedAt: 123, payload: { generatedAt: payload.generatedAt } });
    expect(parseHotspotBrowserCache("not-json")).toBeNull();
    expect(parseHotspotBrowserCache(JSON.stringify({ storedAt: 123, payload: {} }))).toBeNull();
  });
});

describe("persona conversation", () => {
  it("maps every guided answer and preserves seeded values", () => {
    const draft = createPersonaDraft(
      { name: "专业版", niche: "内容增长", accountName: null },
      "默认账号名",
    );

    expect(draft.name).toBe("专业版");
    expect(draft.niche).toBe("内容增长");
    expect(draft.accountName).toBe("默认账号名");
    expect(PERSONA_CONVERSATION_STEPS.map((step) => step.key).sort())
      .toEqual(Object.keys(draft).sort());
  });
});
