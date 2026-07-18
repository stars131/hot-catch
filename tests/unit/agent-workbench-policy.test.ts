import { describe, expect, it } from "vitest";
import { contextUsage, estimateTokens, selectMessagesForCompression } from "@/lib/conversations/context-policy";
import { scrollFollowState } from "@/lib/conversations/scroll-follow";
import { reduceStarEvent, EMPTY_EVENT_PROJECTION } from "@/lib/events/reducer";
import { EVENT_PROTOCOL, type StarEventEnvelope } from "@/lib/events/protocol";
import { memoryPriority, shouldExtractMemory } from "@/lib/memory/policy";
import { modelCapabilities } from "@/lib/providers/model-capabilities";
import { APPROVED_EXTENSION_MANIFESTS } from "@/lib/skills/extension-registry";

describe("cloud agent workbench policies", () => {
  it("compresses old messages while retaining at least twelve recent messages", () => {
    const messages = Array.from({ length: 40 }, (_, index) => ({ content: `${index} ${"内容".repeat(100)}` }));
    const result = selectMessagesForCompression(messages, 2_000);
    expect(result.compress.length).toBeGreaterThan(0);
    expect(result.retained.length).toBeGreaterThanOrEqual(12);
    expect(contextUsage(result.totalTokens, 2_000).shouldCompress).toBe(true);
    expect(estimateTokens("一段中文 context")).toBeGreaterThan(2);
  });

  it("rejects low-signal and secret-like memory candidates", () => {
    expect(shouldExtractMemory("谢谢")).toBe(false);
    expect(shouldExtractMemory("请记住我的 api_key 是 sk-abcdefghijklmnop")).toBe(false);
    expect(shouldExtractMemory("以后写开头时先给具体场景，再说明读者能够获得什么，不要使用空泛口号。")).toBe(true);
    expect(memoryPriority({ scope: "account", status: "approved" } as never)).toBeGreaterThan(memoryPriority({ scope: "global", status: "candidate" } as never));
  });

  it("detects sequence gaps and epoch resets", () => {
    const first = event(1, "epoch-a", "message.created", { messageId: "m1" });
    const state = reduceStarEvent(EMPTY_EVENT_PROJECTION, first);
    expect(state.messages.m1).toBeTruthy();
    expect(reduceStarEvent(state, event(3, "epoch-a", "run.updated", { runId: "r1" })).needsReset).toBe(true);
    expect(reduceStarEvent(state, event(2, "epoch-b", "run.updated", { runId: "r1" })).needsReset).toBe(true);
  });

  it("keeps extension manifests declarative and capability-limited", () => {
    for (const manifest of APPROVED_EXTENSION_MANIFESTS) {
      expect(manifest.protocol).toBe("star-skill-extension/v1");
      expect(JSON.stringify(manifest)).not.toMatch(/https?:|shell|mcp|code\s*:/i);
      expect(manifest.capabilities.every((item) => ["read_context", "shape_output", "compliance_check"].includes(item))).toBe(true);
    }
  });

  it("declares model capabilities and stable scroll hysteresis", () => {
    expect(modelCapabilities("deepseek").contextWindow).toBeGreaterThanOrEqual(128_000);
    expect(scrollFollowState(120, "following")).toBe("detached");
    expect(scrollFollowState(20, "detached")).toBe("following");
    expect(scrollFollowState(70, "detached")).toBe("detached");
  });
});

function event(seq: number, streamEpoch: string, type: StarEventEnvelope["type"], payload: unknown): StarEventEnvelope {
  return { protocol: EVENT_PROTOCOL, conversationId: "c1", seq, streamEpoch, type, payload, createdAt: new Date(0).toISOString() };
}
