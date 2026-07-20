import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import {
  AgentReachWebProvider,
  probeAgentReachWebChannel,
} from "@/lib/providers/agent-reach/provider";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("Agent Reach provider", () => {
  it("keeps the integration disabled by default without launching a process", async () => {
    const runner = vi.fn(async () => "{}");
    const result = await probeAgentReachWebChannel({ enabled: false, runner });

    expect(result).toEqual({ available: false, reason: "AGENT_REACH_DISABLED" });
    expect(runner).not.toHaveBeenCalled();
  });

  it("accepts the fixed web channel status returned by Agent Reach", async () => {
    const result = await probeAgentReachWebChannel({
      enabled: true,
      runner: async () =>
        JSON.stringify({
          channel: "web",
          status: "ok",
          active_backend: "Jina Reader",
        }),
    });

    expect(result).toEqual({ available: true, activeBackend: "Jina Reader" });
  });

  it("turns malformed or unavailable probe output into a stable reason", async () => {
    await expect(
      probeAgentReachWebChannel({ enabled: true, runner: async () => "raw secret failure" }),
    ).resolves.toEqual({ available: false, reason: "AGENT_REACH_UNAVAILABLE" });
    await expect(
      probeAgentReachWebChannel({
        enabled: true,
        runner: async () =>
          JSON.stringify({ channel: "web", status: "warn", active_backend: null }),
      }),
    ).resolves.toEqual({
      available: false,
      reason: "AGENT_REACH_CHANNEL_UNAVAILABLE",
    });
  });

  it("reads a public page through the Agent Reach selected Jina backend", async () => {
    server.use(
      http.get(/^https:\/\/r\.jina\.ai\/.+/, ({ request }) => {
        expect(request.url).toBe("https://r.jina.ai/http://web.test/article");
        return HttpResponse.text("Title: 可验证的网页标题\n\n# 正文\n\n这是公开页面内容。");
      }),
    );

    const result = await new AgentReachWebProvider("Jina Reader").importUrl(
      "http://web.test/article",
    );

    expect(result.title).toBe("可验证的网页标题");
    expect(result.markdown).toContain("公开页面内容");
    expect(result.metadata).toMatchObject({
      agentReachChannel: "web",
      activeBackend: "Jina Reader",
    });
  });
});
