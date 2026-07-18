import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearHotspotCache,
  getHotspotPayload,
  getHotspotSourcePayload,
  listHotspotSourceDefinitions,
} from "@/lib/hotspots/hotspot-service";

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("credential-free hotspot sources", () => {
  it("publishes a fully public catalog and retires the dead 360 Trends source", () => {
    const sources = listHotspotSourceDefinitions();

    expect(sources).toHaveLength(25);
    expect(sources.every((source) => source.credentialFree)).toBe(true);
    expect(sources.every((source) => !source.requiresCookie)).toBe(true);
    expect(sources.every((source) => source.publicBackends.length > 0)).toBe(true);
    expect(sources.filter((source) => source.supportsOptionalConnection)).toHaveLength(8);
    expect(sources.some((source) => source.code === "ifeng")).toBe(true);
    expect(sources.some((source) => String(source.code) === "so360")).toBe(false);
  });

  it("coalesces concurrent public refreshes into one retrieval run", async () => {
    clearHotspotCache();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const url = String(input);
      return jsonResponse({
        data: [{ title: `公开热点 ${url}`, url, score: 100 }],
        items: [{ title: `公开热点 ${url}`, url, score: 100 }],
      });
    }));

    const [first, second] = await Promise.all([
      getHotspotPayload({ refresh: true, limit: 2 }),
      getHotspotPayload({ refresh: true, limit: 2 }),
    ]);

    expect(first).toBe(second);
  });

  it("normalizes the public 36Kr POST endpoint without credentials", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("gateway.36kr.com")) {
        expect(init?.method).toBe("POST");
        expect(init?.headers).not.toHaveProperty("Cookie");
        return jsonResponse({
          data: {
            hotRankList: [{
              itemId: "123",
              templateMaterial: {
                widgetTitle: "36氪公开热点",
                authorName: "公开作者",
                statCollect: 321,
              },
            }],
          },
        });
      }
      return jsonResponse({ message: "unavailable in fixture" }, 503);
    });
    vi.stubGlobal("fetch", fetchMock);

    const payload = await getHotspotSourcePayload("36kr");

    expect(payload.health.ok).toBe(true);
    expect(payload.source.requiresCookie).toBe(false);
    expect(payload.items[0]).toMatchObject({
      title: "36氪公开热点",
      url: "https://www.36kr.com/p/123",
      backend: "36氪原生",
    });
  });

  it("uses the public 60s rednote route for Xiaohongshu", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://60s.viki.moe/v2/rednote") {
        return jsonResponse({
          data: [{
            title: "小红书公开热点",
            score: "9988",
            link: "https://www.xiaohongshu.com/search_result?keyword=test",
          }],
        });
      }
      return jsonResponse({}, 503);
    }));

    const payload = await getHotspotSourcePayload("xiaohongshu");

    expect(payload.health.ok).toBe(true);
    expect(payload.source.publicBackends).toContain("60s");
    expect(payload.items[0]).toMatchObject({
      title: "小红书公开热点",
      backend: "60s",
    });
  });

  it("falls back to a documented public 60s mirror when the primary is rate limited", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://60s.viki.moe/v2/rednote") {
        return jsonResponse({ message: "rate limited" }, 429);
      }
      if (url === "https://60s.crystelf.top/v2/rednote") {
        return jsonResponse({
          data: [{
            title: "小红书镜像热点",
            score: "7788",
            link: "https://www.xiaohongshu.com/search_result?keyword=mirror",
          }],
        });
      }
      return jsonResponse({}, 503);
    }));

    const payload = await getHotspotSourcePayload("xiaohongshu");

    expect(payload.health.ok).toBe(true);
    expect(payload.items[0]).toMatchObject({
      title: "小红书镜像热点",
      backend: "60s 公共镜像",
    });
  });

  it("uses the no-key public fallback for Sogou", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.tcslw.cn/api/hotlist?type=sogou") {
        return jsonResponse({
          success: true,
          data: [{ title: "搜狗公开热点", hot: "12万", url: "https://www.sogou.com/" }],
        });
      }
      return jsonResponse({}, 503);
    }));

    const payload = await getHotspotSourcePayload("sogou");

    expect(payload.health.ok).toBe(true);
    expect(payload.items[0]).toMatchObject({
      title: "搜狗公开热点",
      backend: "驼城API",
    });
  });

  it("uses the no-key public fallback for Sina", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.tcslw.cn/api/hotlist/sina?type=search") {
        return jsonResponse({
          success: true,
          data: [{ title: "Sina public trend", hot: "3840000", url: "https://search.sina.com.cn/?q=test" }],
        });
      }
      return jsonResponse({}, 503);
    }));

    const payload = await getHotspotSourcePayload("sina");

    expect(payload.health.ok).toBe(true);
    expect(payload.source.publicBackends).toContain("驼城API");
    expect(payload.items[0]).toMatchObject({
      title: "Sina public trend",
      backend: "驼城API",
    });
  });
});
