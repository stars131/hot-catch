import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jobs/connection", () => ({
  getRedisConnection: () => {
    throw new Error("redis unavailable in focused unit test");
  },
}));

import {
  consumeRateLimit,
  resetRateLimitMemory,
} from "@/lib/security/rate-limit";

describe("paid model-test rate limit", () => {
  beforeEach(() => resetRateLimitMemory());

  it("uses the explicit development/test fallback and blocks over limit", async () => {
    const options = {
      key: "model-test:user-a:grok",
      limit: 2,
      windowSeconds: 60,
    };
    await expect(consumeRateLimit(options)).resolves.toMatchObject({ allowed: true });
    await expect(consumeRateLimit(options)).resolves.toMatchObject({ allowed: true });
    await expect(consumeRateLimit(options)).resolves.toMatchObject({ allowed: false });
  });

  it("isolates counters by user/provider key", async () => {
    const common = { limit: 1, windowSeconds: 60 };
    await consumeRateLimit({ ...common, key: "model-test:user-a:grok" });
    await expect(
      consumeRateLimit({ ...common, key: "model-test:user-b:grok" }),
    ).resolves.toMatchObject({ allowed: true });
  });
});
