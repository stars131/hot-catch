import { describe, expect, it } from "vitest";
import { normalizeMetrics } from "@/lib/metrics/normalizer";

describe("metric normalization", () => {
  it("maps nested provider analytics into stable counters", () => {
    expect(
      normalizeMetrics({
        data: {
          analytics: {
            playCount: "12,345",
            likeCount: 450,
            collectCount: 120,
            commentCount: 32,
            forwardCount: 18,
          },
        },
      }),
    ).toMatchObject({
      viewCount: 12345,
      likeCount: 450,
      collectCount: 120,
      commentCount: 32,
      shareCount: 18,
    });
  });
});
