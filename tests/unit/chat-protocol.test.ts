import { describe, expect, it } from "vitest";
import { CHAT_PROTOCOL } from "@/lib/creator/chat-protocol";
import {
  agentCommandSchema,
  chatCardSchema,
  chatMessageMetadataV1Schema,
  invokeCardActionRequestSchema,
  parseChatMessageMetadata,
  sendMessageRequestSchema,
} from "@/lib/creator/chat-schemas";
import {
  SKILL_PROTOCOL,
  assertCapabilitiesAllowed,
  skillExecutionResultSchema,
  skillManifestSchema,
  type SkillManifestV1,
} from "@/lib/creator/skill-protocol";

const validOptionCard = {
  id: "card-platform",
  version: 1,
  type: "option",
  title: "选择内容方向",
  mode: "single",
  options: [
    { id: "opt-experience", label: "经验分享", recommended: true },
    { id: "opt-checklist", label: "步骤清单" },
  ],
  submitAction: { actionId: "direction.submit", label: "确认方向" },
} as const;

const validArtifactCard = {
  id: "card-artifact-1",
  version: 1,
  type: "artifact",
  contentId: "content-1",
  revisionId: "revision-1",
  revisionNumber: 3,
  platform: "xiaohongshu",
  contentKind: "xhs_graphic",
  title: "小红书图文初稿",
  score: 82,
  actions: [{ actionId: "artifact.open", label: "打开编辑", appearance: "primary" }],
} as const;

describe("star-chat/v1 metadata schema", () => {
  it("接受包含选项卡与成果卡的合法元数据", () => {
    const metadata = {
      protocol: CHAT_PROTOCOL,
      cards: [validOptionCard, validArtifactCard],
      runId: "run-1",
    };
    const parsed = chatMessageMetadataV1Schema.parse(metadata);
    expect(parsed.cards).toHaveLength(2);
    expect(parseChatMessageMetadata(metadata)?.runId).toBe("run-1");
  });

  it("旧消息 metadata(null/纯文本形状)安全回退为 null", () => {
    expect(parseChatMessageMetadata(null)).toBeNull();
    expect(parseChatMessageMetadata(undefined)).toBeNull();
    expect(parseChatMessageMetadata({ intent: "xhs_note_url", legacy: true })).toBeNull();
    expect(parseChatMessageMetadata({ protocol: "star-chat/v2", cards: [] })).toBeNull();
  });

  it("拒绝未知卡片类型", () => {
    expect(
      chatCardSchema.safeParse({ id: "x", version: 1, type: "iframe", src: "https://a.b" })
        .success,
    ).toBe(false);
  });

  it("strict 模式拒绝夹带未声明字段(不允许卡片携带 API 地址或脚本)", () => {
    const smuggled = {
      ...validOptionCard,
      apiUrl: "https://evil.example/exec",
    };
    expect(chatCardSchema.safeParse(smuggled).success).toBe(false);

    const smuggledAction = {
      ...validOptionCard,
      submitAction: { actionId: "a.b", label: "确认", href: "javascript:alert(1)" },
    };
    expect(chatCardSchema.safeParse(smuggledAction).success).toBe(false);
  });

  it("拒绝非 http/https 的 sourceUrl", () => {
    const card = {
      id: "ref-1",
      version: 1,
      type: "reference",
      state: "ready",
      sourceUrl: "javascript:alert(1)",
    };
    expect(chatCardSchema.safeParse(card).success).toBe(false);
  });

  it("拒绝不稳定的 actionId", () => {
    const card = {
      ...validOptionCard,
      submitAction: { actionId: "DROP TABLE users;--", label: "确认" },
    };
    expect(chatCardSchema.safeParse(card).success).toBe(false);
  });
});

describe("agent command 白名单", () => {
  it("接受白名单命令", () => {
    expect(agentCommandSchema.parse("reference.import")).toBe("reference.import");
    expect(agentCommandSchema.parse("content.generate")).toBe("content.generate");
  });

  it("拒绝白名单之外的命令", () => {
    expect(agentCommandSchema.safeParse("db.raw_sql").success).toBe(false);
    expect(agentCommandSchema.safeParse("publish.execute").success).toBe(false);
  });
});

describe("消息与动作请求 schema", () => {
  it("接受合法发送消息请求", () => {
    const parsed = sendMessageRequestSchema.parse({
      clientMessageId: "cm-123",
      parts: [
        { type: "text", text: "帮我写一篇 AI 面试复盘" },
        { type: "reference_url", url: "https://www.xiaohongshu.com/explore/abc" },
      ],
      context: { platform: "xiaohongshu" },
    });
    expect(parsed.parts).toHaveLength(2);
  });

  it("拒绝空 parts 与未声明的 context 字段", () => {
    expect(
      sendMessageRequestSchema.safeParse({ clientMessageId: "cm-1", parts: [] }).success,
    ).toBe(false);
    expect(
      sendMessageRequestSchema.safeParse({
        clientMessageId: "cm-1",
        parts: [{ type: "text", text: "hi" }],
        context: { platform: "xiaohongshu", rawSql: "select 1" },
      }).success,
    ).toBe(false);
  });

  it("卡片动作回传只允许标识符与选择值", () => {
    expect(
      invokeCardActionRequestSchema.parse({
        clientActionId: "ca-1",
        sourceMessageId: "msg-1",
        cardId: "card-platform",
        actionId: "direction.submit",
        values: { optionIds: ["opt-experience"] },
      }).actionId,
    ).toBe("direction.submit");

    expect(
      invokeCardActionRequestSchema.safeParse({
        clientActionId: "ca-1",
        sourceMessageId: "msg-1",
        cardId: "card-platform",
        actionId: "direction.submit",
        payload: { url: "https://evil.example" },
      }).success,
    ).toBe(false);
  });
});

describe("star-skill/v1 schema", () => {
  const manifest: SkillManifestV1 = {
    protocol: SKILL_PROTOCOL,
    id: "builtin.reference-to-original",
    version: "1.0.0",
    name: "参考转原创",
    description: "根据参考结构生成原创初稿",
    triggers: ["参考生成", "reference-to-original"],
    inputSchema: {},
    outputSchema: {},
    requiredCapabilities: ["reference.read_selected", "job.request"],
    execution: { type: "builtin" },
  };

  it("接受合法内置 Skill manifest", () => {
    expect(skillManifestSchema.parse(manifest).id).toBe("builtin.reference-to-original");
  });

  it("拒绝 http 远程端点与未知能力", () => {
    expect(
      skillManifestSchema.safeParse({
        ...manifest,
        execution: { type: "remote", endpoint: "http://insecure.example/skill" },
      }).success,
    ).toBe(false);
    expect(
      skillManifestSchema.safeParse({
        ...manifest,
        requiredCapabilities: ["prisma.write_any"],
      }).success,
    ).toBe(false);
  });

  it("能力越权时抛出", () => {
    expect(() =>
      assertCapabilitiesAllowed(manifest, ["reference.read_selected"]),
    ).toThrow(/未授权能力/);
    expect(() =>
      assertCapabilitiesAllowed(manifest, ["reference.read_selected", "job.request"]),
    ).not.toThrow();
  });

  it("执行结果只允许 proposed effect,拒绝直接副作用形状", () => {
    expect(
      skillExecutionResultSchema.parse({
        status: "completed",
        text: "已生成建议",
        proposedEffects: [
          { type: "job.request", action: "content.generate", input: { contentId: "c1" } },
        ],
      }).status,
    ).toBe("completed");

    expect(
      skillExecutionResultSchema.safeParse({
        status: "completed",
        directWrites: [{ table: "GeneratedContent" }],
      }).success,
    ).toBe(false);
    expect(
      skillExecutionResultSchema.safeParse({
        status: "completed",
        proposedEffects: [{ type: "prisma.delete", payload: {} }],
      }).success,
    ).toBe(false);
  });
});
