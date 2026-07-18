import { describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { discoverX } from "@/lib/x/discovery";

describe("X discovery", () => {
  it("collects WOEID trends with evidence links and rate-limit metadata", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      data: [
        { trend_name: "#OpenSource", tweet_count: 42000 },
        { trend_name: "AI agents", tweet_count: null },
      ],
    }, 200, {
      "x-rate-limit-limit": "75",
      "x-rate-limit-remaining": "74",
      "x-rate-limit-reset": "2000000000",
    }));

    const result = await discoverX(
      { mode: "region", woeid: 1, regionName: "全球", maxResults: 20 },
      "test-token",
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/trends/by/woeid/1?"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) }),
    );
    expect(result.trends).toEqual([
      expect.objectContaining({ name: "#OpenSource", postCount: 42000, rank: 1 }),
      expect.objectContaining({ name: "AI agents", postCount: null, rank: 2 }),
    ]);
    expect(result.trends[0].url).toContain("x.com/search");
    expect(result.rateLimit.remaining).toBe(74);
  });

  it("builds a recent-search query and ranks public posts by engagement", async () => {
    let requestedUrl = "";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      requestedUrl = String(input);
      return jsonResponse({
        data: [
          {
            id: "low",
            text: "Lower engagement",
            author_id: "u1",
            created_at: "2026-07-18T01:00:00.000Z",
            lang: "zh",
            public_metrics: { like_count: 3, reply_count: 1, retweet_count: 0, quote_count: 0 },
          },
          {
            id: "high",
            text: "Higher engagement",
            author_id: "u1",
            created_at: "2026-07-18T02:00:00.000Z",
            lang: "zh",
            public_metrics: { like_count: 10, reply_count: 2, retweet_count: 4, quote_count: 1 },
          },
        ],
        includes: {
          users: [{
            id: "u1",
            name: "Researcher",
            username: "researcher",
            public_metrics: { followers_count: 1200 },
          }],
        },
      });
    });

    const result = await discoverX(
      { mode: "topic", query: "AI OR 人工智能", language: "zh", maxResults: 30 },
      "test-token",
      fetchMock,
    );

    const decoded = new URL(requestedUrl);
    expect(decoded.searchParams.get("query")).toBe("(AI OR 人工智能) lang:zh -is:retweet");
    expect(decoded.searchParams.get("tweet.fields")).toContain("public_metrics");
    expect(result.posts.map((post) => post.id)).toEqual(["high", "low"]);
    expect(result.posts[0]).toMatchObject({
      author: { username: "researcher", followers: 1200 },
      metrics: { likes: 10, reposts: 4, replies: 2, quotes: 1 },
    });
    expect(result.posts[0].url).toBe("https://x.com/researcher/status/high");
  });

  it("keeps successful account timelines when another account partially fails", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/users/by?")) {
        return jsonResponse({
          data: [
            { id: "1", name: "One", username: "one" },
            { id: "2", name: "Two", username: "two" },
          ],
        });
      }
      if (url.includes("/users/1/tweets")) {
        return jsonResponse({ data: [{ id: "p1", text: "one post", author_id: "1" }] });
      }
      return jsonResponse({ errors: [{ title: "Unavailable", detail: "timeline unavailable" }] }, 503);
    });

    const result = await discoverX(
      { mode: "accounts", usernames: ["one", "two"], maxResults: 10 },
      "test-token",
      fetchMock,
    );

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].account.username).toBe("one");
    expect(result.accounts[0].posts[0].url).toBe("https://x.com/one/status/p1");
    expect(result.warnings.join(" ")).toContain("@two");
  });

  it("maps invalid credentials and provider rate limits to explicit app errors", async () => {
    await expect(
      discoverX(
        { mode: "region", woeid: 1, maxResults: 20 },
        "bad-token",
        async () => jsonResponse({ errors: [{ detail: "Unauthorized" }] }, 401),
      ),
    ).rejects.toMatchObject({ code: "CREDENTIAL_INVALID", statusCode: 422 } satisfies Partial<AppError>);

    await expect(
      discoverX(
        { mode: "region", woeid: 1, maxResults: 20 },
        "limited-token",
        async () => jsonResponse({ errors: [{ detail: "Too many requests" }] }, 429),
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", statusCode: 429 } satisfies Partial<AppError>);
  });
});

function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
