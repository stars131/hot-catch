import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import fixture from "@/tests/fixtures/tikhub/douyin-video.json";
import { TikHubProvider } from "@/lib/providers/tikhub/provider";

const apiKey = "tikhub-secret-fixture";
const server = setupServer(
  http.get("https://tikhub.test/api/v1/douyin/web/fetch_one_video", ({ request }) => {
    if (request.headers.get("Authorization") !== `Bearer ${apiKey}`) {
      return new HttpResponse(null, { status: 401 });
    }
    return HttpResponse.json(fixture);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("TikHub provider contract", () => {
  it("normalizes a Douyin video and keeps the API key out of output", async () => {
    const provider = new TikHubProvider(apiKey);
    const reference = await provider.parseReference(
      "https://www.douyin.com/video/7420000000000000001",
    );
    const content = await provider.getContent(reference);
    expect(content).toMatchObject({
      platform: "douyin",
      platformContentId: "7420000000000000001",
      durationSec: 18,
      metrics: { views: 18000, likes: 920, comments: 64, shares: 81 },
    });
    expect(JSON.stringify(content)).not.toContain(apiKey);
  });
});
