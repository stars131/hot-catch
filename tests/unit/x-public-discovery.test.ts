import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { discoverXPublic } from "@/lib/x/public-discovery";

describe("credential-free X discovery", () => {
  it("reads the public global trend stream without an Authorization header", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      code: 200,
      trends: [
        { name: "#OpenSource", rank: "1", context: "Technology" },
        { name: "AI agents", rank: null, grouped_topics: [{ name: "Artificial Intelligence" }] },
      ],
    }));

    const result = await discoverXPublic(
      { mode: "region", woeid: 1, regionName: "全球", maxResults: 20 },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("api.fxtwitter.com/2/trends"),
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
      }),
    );
    expect(result).toMatchObject({ source: "FxTwitter public API", dataTier: "public-osint" });
    expect(result.trends).toEqual([
      expect.objectContaining({ name: "#OpenSource", rank: 1, context: "Technology" }),
      expect.objectContaining({ name: "AI agents", rank: 2, context: "Artificial Intelligence" }),
    ]);
  });

  it("uses a country place filter for regional hotspots and retains post evidence", async () => {
    let requestedUrl = "";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return jsonResponse({
        code: 200,
        results: [
          fxPost("wrong-region", "Unrelated update", 100, "california_source", {}, "California"),
          fxPost("au-1", "Australian AI update", 20, "australia_ai", {}, "Sydney"),
        ],
      });
    });

    const result = await discoverXPublic(
      { mode: "region", woeid: 23424748, regionName: "澳大利亚", maxResults: 20 },
      fetchMock,
    );

    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/2/search");
    expect(url.searchParams.get("q")).toBe("place_country:AU");
    expect(url.searchParams.get("feed")).toBe("top");
    expect(result.posts[0]).toMatchObject({
      id: "au-1",
      url: "https://x.com/australia_ai/status/au-1",
      author: { username: "australia_ai" },
    });
    expect(result.posts.map((post) => post.id)).not.toContain("wrong-region");
    expect(result.coverage).toContain("本地复核");
  });

  it("builds a public topic query and ranks posts by public engagement", async () => {
    let requestedUrl = "";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return jsonResponse({
        code: 200,
        results: [
          fxPost("low", "Lower", 2, "researcher"),
          fxPost("high", "Higher", 10, "researcher", { reposts: 5, replies: 3 }),
        ],
      });
    });

    const result = await discoverXPublic(
      { mode: "topic", query: "AI OR 人工智能", language: "zh", maxResults: 30 },
      fetchMock,
    );

    expect(new URL(requestedUrl).searchParams.get("q")).toBe("(AI OR 人工智能) lang:zh -is:retweet");
    expect(result.posts.map((post) => post.id)).toEqual(["high", "low"]);
    expect(result.posts[0].metrics).toMatchObject({ likes: 10, reposts: 5, replies: 3 });
  });

  it("keeps successful public account timelines when another account fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/profile/one/statuses")) {
        return jsonResponse({ code: 200, results: [fxPost("p1", "one post", 4, "one")] });
      }
      if (url.includes("/profile/one?")) {
        return jsonResponse({ code: 200, user: fxProfile("one") });
      }
      return jsonResponse({ code: 404, message: "User not found" }, 404);
    });

    const result = await discoverXPublic(
      { mode: "accounts", usernames: ["one", "missing"], maxResults: 10 },
      fetchMock,
    );

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].account.username).toBe("one");
    expect(result.accounts[0].posts[0].id).toBe("p1");
    expect(result.warnings.join(" ")).toContain("@missing");
  });

  it("maps public upstream rate limiting to an explicit application error", async () => {
    await expect(
      discoverXPublic(
        { mode: "topic", query: "AI", maxResults: 10 },
        async () => jsonResponse({ code: 429, message: "slow down" }, 429),
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", statusCode: 429 } satisfies Partial<AppError>);
  });

  it("retries one transient public upstream failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 502, message: "temporary" }, 502))
      .mockResolvedValueOnce(jsonResponse({ code: 200, results: [fxPost("ok", "Recovered", 1, "source")] }));

    const result = await discoverXPublic(
      { mode: "topic", query: "OSINT", maxResults: 10 },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.posts[0].id).toBe("ok");
  });
});

function fxPost(
  id: string,
  text: string,
  likes: number,
  username: string,
  metrics: { reposts?: number; replies?: number; quotes?: number; bookmarks?: number } = {},
  location = "Australia",
) {
  return {
    type: "status",
    id,
    url: `https://x.com/${username}/status/${id}`,
    text,
    created_at: "Sat Jul 18 00:42:33 +0000 2026",
    lang: "en",
    author: fxProfile(username, location),
    likes,
    reposts: metrics.reposts ?? 0,
    replies: metrics.replies ?? 0,
    quotes: metrics.quotes ?? 0,
    bookmarks: metrics.bookmarks ?? 0,
    views: 100,
  };
}

function fxProfile(username: string, location = "Australia") {
  return {
    type: "profile",
    id: `user-${username}`,
    name: username.toUpperCase(),
    screen_name: username,
    followers: 1200,
    description: "Public account",
    location,
    avatar_url: "https://example.com/avatar.png",
    verification: { verified: false },
  };
}

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
