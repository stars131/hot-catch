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

  it("接受对话式创作设置卡与 AI 选题卡", () => {
    const setup = {
      id: "card-creation-setup-1",
      version: 1,
      type: "creation_setup",
      brief: "把一场产品发布会做成多平台内容",
      uiLocale: "zh-CN",
      maxPlatforms: 5,
      platformOptions: [
        { id: "xiaohongshu", label: "小红书", description: "图文", group: "domestic" },
        { id: "youtube", label: "YouTube", description: "视频内容包", group: "global" },
      ],
      localeOptions: [
        { id: "zh-CN", label: "简体中文" },
        { id: "en-US", label: "English" },
      ],
      skillOptions: [
        { id: "builtin.reference-to-original", label: "参考转原创" },
      ],
      defaultPlatformIds: ["xiaohongshu"],
      defaultLocaleId: "zh-CN",
      defaultSkillIds: [],
      confirmAction: { actionId: "creation.generate_bundle", label: "开始生成" },
    };
    const ideas = {
      id: "card-ideas-1",
      version: 1,
      type: "idea_candidates",
      brief: "AI 产品发布会",
      direction: "经验复盘",
      uiLocale: "zh-CN",
      candidates: [
        { id: "idea-1", title: "发布会复盘", angle: "从失误切入", audience: "产品团队", reason: "可执行" },
        { id: "idea-2", title: "发布清单", angle: "从准备切入", audience: "创业者", reason: "高复用" },
      ],
      chooseAction: { actionId: "idea.choose", label: "选择" },
      skipAction: { actionId: "idea.skip", label: "跳过" },
    };

    expect(chatCardSchema.safeParse(setup).success).toBe(true);
    expect(chatCardSchema.safeParse(ideas).success).toBe(true);
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

describe("publish_readiness 卡协议(C8)", () => {
  const validReadinessCard = {
    id: "card-publish-ready-abc123",
    version: 1,
    type: "publish_readiness",
    contentId: "content-1",
    revisionId: "rev-3",
    revisionNumber: 3,
    platform: "xiaohongshu",
    contentKind: "xhs_graphic",
    title: "AI 面试复盘",
    state: "warnings",
    connection: "missing",
    items: [
      { key: "title", label: "标题", level: "pass", detail: "标题已填写(9 字)。" },
      { key: "tags", label: "话题标签", level: "warn", detail: "建议添加 3–6 个。" },
    ],
    actions: [
      {
        actionId: "publish.confirm_handoff",
        label: "确认并移交发布中心",
        appearance: "primary",
        requiresConfirmation: true,
      },
      { actionId: "connection.open", label: "打开连接设置", repeatable: true },
    ],
  };

  it("合法就绪卡通过校验", () => {
    expect(chatCardSchema.safeParse(validReadinessCard).success).toBe(true);
  });

  it("拒绝未知状态、越界 items 与未声明字段", () => {
    expect(
      chatCardSchema.safeParse({ ...validReadinessCard, state: "published" }).success,
    ).toBe(false);
    expect(
      chatCardSchema.safeParse({ ...validReadinessCard, connection: "oauth" }).success,
    ).toBe(false);
    expect(
      chatCardSchema.safeParse({
        ...validReadinessCard,
        items: [{ key: "x", label: "X", level: "fatal" }],
      }).success,
    ).toBe(false);
    expect(
      chatCardSchema.safeParse({
        ...validReadinessCard,
        publishUrl: "https://evil.example/publish",
      }).success,
    ).toBe(false);
  });

  it("notice 卡允许可选实体引用,拒绝任意引用形状", () => {
    const notice = {
      id: "notice-handoff-ok-1",
      version: 1,
      type: "notice",
      tone: "success",
      title: "已移交发布中心(待你手动发布)",
      reference: { type: "content", id: "content-1" },
      actions: [
        { actionId: "publish.open_workspace", label: "打开发布中心", repeatable: true },
      ],
    };
    expect(chatCardSchema.safeParse(notice).success).toBe(true);
    expect(
      chatCardSchema.safeParse({
        ...notice,
        reference: { type: "url", id: "https://evil.example" },
      }).success,
    ).toBe(false);
  });

  it("publishTarget 上下文只允许内容 ID", () => {
    const request = {
      clientMessageId: "cm-1",
      parts: [{ type: "text", text: "准备发布《AI 面试复盘》" }],
      context: { publishTarget: { contentId: "content-1" } },
    };
    expect(sendMessageRequestSchema.safeParse(request).success).toBe(true);
    expect(
      sendMessageRequestSchema.safeParse({
        ...request,
        context: {
          publishTarget: { contentId: "content-1", accountId: "acc-1" },
        },
      }).success,
    ).toBe(false);
  });
});

describe("patch 卡协议(C7)", () => {
  const validPatchCard = {
    id: "card-patch-abc123",
    version: 1,
    type: "patch",
    contentId: "content-1",
    revisionId: "rev-1",
    revisionNumber: 3,
    contentKind: "xhs_graphic",
    section: { kind: "page", index: 1 },
    sectionLabel: "第 2 页",
    skillId: "builtin.rewrite-section",
    instruction: "把这段改得更具体",
    before: "修改前的文本",
    after: "修改后的文本",
    origin: "local_preview",
    actions: [
      { actionId: "patch.apply", label: "应用为新版本", appearance: "primary" },
      { actionId: "patch.dismiss", label: "忽略", appearance: "ghost" },
    ],
  };

  it("合法 patch 卡通过校验", () => {
    expect(chatCardSchema.safeParse(validPatchCard).success).toBe(true);
  });

  it("origin 只允许 local_preview,未声明字段被拒绝", () => {
    expect(
      chatCardSchema.safeParse({ ...validPatchCard, origin: "deepseek" }).success,
    ).toBe(false);
    expect(
      chatCardSchema.safeParse({ ...validPatchCard, apiUrl: "https://evil.example.com" })
        .success,
    ).toBe(false);
    expect(
      chatCardSchema.safeParse({
        ...validPatchCard,
        section: { kind: "sql", index: 0 },
      }).success,
    ).toBe(false);
  });

  it("patchTarget 上下文只允许区块引用与摘录", () => {
    const request = {
      clientMessageId: "cm-1",
      parts: [{ type: "text", text: "请修改第 2 页" }],
      context: {
        patchTarget: {
          contentId: "content-1",
          section: { kind: "page", index: 1 },
          excerpt: "修改前的文本",
          skillId: "builtin.compress-text",
        },
      },
    };
    expect(sendMessageRequestSchema.safeParse(request).success).toBe(true);
    expect(
      sendMessageRequestSchema.safeParse({
        ...request,
        context: {
          patchTarget: {
            contentId: "content-1",
            section: { kind: "page", index: 1 },
            replacement: "客户端不允许直接提交替换文本",
          },
        },
      }).success,
    ).toBe(false);
  });
});
