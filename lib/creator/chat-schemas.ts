import { z } from "zod";
import {
  AGENT_COMMANDS,
  CHAT_PROTOCOL,
  type ChatCard,
  type ChatMessageMetadataV1,
} from "@/lib/creator/chat-protocol";
import {
  CONTENT_KIND_IDS,
  CONTENT_LOCALES,
  PLATFORM_IDS,
} from "@/lib/platforms/registry";

/**
 * star-chat/v1 的运行时校验。
 *
 * 安全规则:
 * - 所有对象 strict(),卡片不能夹带 API 地址、Key、SQL、脚本等未声明字段。
 * - actionId / 卡片 id 只允许稳定标识符字符,客户端不得执行卡片自带的任意内容。
 * - URL 字段只允许 http/https。
 */

const STABLE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,99}$/;

const stableIdSchema = z.string().regex(STABLE_ID, "必须是稳定标识符");

const httpUrlSchema = z
  .string()
  .max(2048)
  .url()
  .refine((value) => /^https?:\/\//i.test(value), "只允许 http/https 链接");

export const entityRefSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("idea"), id: z.string().min(1) }).strict(),
  z.object({ type: z.literal("benchmark_account"), id: z.string().min(1) }).strict(),
  z.object({ type: z.literal("benchmark_note"), id: z.string().min(1) }).strict(),
  z.object({ type: z.literal("content"), id: z.string().min(1) }).strict(),
  z.object({ type: z.literal("content_revision"), id: z.string().min(1) }).strict(),
  z.object({ type: z.literal("style_profile"), id: z.string().min(1) }).strict(),
]);

export const cardActionSchema = z
  .object({
    actionId: stableIdSchema,
    label: z.string().min(1).max(60),
    appearance: z.enum(["primary", "secondary", "ghost", "danger"]).optional(),
    repeatable: z.boolean().optional(),
    requiresConfirmation: z.boolean().optional(),
  })
  .strict();

const cardBase = {
  id: stableIdSchema,
  version: z.literal(1),
};

export const optionCardSchema = z
  .object({
    ...cardBase,
    type: z.literal("option"),
    title: z.string().min(1).max(200),
    mode: z.enum(["single", "multiple"]),
    options: z
      .array(
        z
          .object({
            id: stableIdSchema,
            label: z.string().min(1).max(120),
            description: z.string().max(500).optional(),
            recommended: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    submitAction: cardActionSchema,
    uiLocale: z.enum(["zh-CN", "en-US"]).optional(),
  })
  .strict();

export const creationSetupCardSchema = z
  .object({
    ...cardBase,
    type: z.literal("creation_setup"),
    brief: z.string().trim().min(1).max(12000),
    uiLocale: z.enum(["zh-CN", "en-US"]),
    maxPlatforms: z.literal(5),
    platformOptions: z
      .array(
        z
          .object({
            id: z.enum(PLATFORM_IDS),
            label: z.string().min(1).max(80),
            description: z.string().min(1).max(200),
            group: z.enum(["domestic", "global"]),
          })
          .strict(),
      )
      .min(2)
      .max(PLATFORM_IDS.length),
    localeOptions: z
      .array(
        z
          .object({
            id: z.enum(CONTENT_LOCALES),
            label: z.string().min(1).max(80),
          })
          .strict(),
      )
      .min(2)
      .max(CONTENT_LOCALES.length),
    skillOptions: z
      .array(
        z
          .object({
            id: z.string().regex(/^(?:builtin|custom)\.[a-z0-9._-]{2,80}$/),
            label: z.string().min(1).max(120),
            description: z.string().max(500).optional(),
          })
          .strict(),
      )
      .max(30),
    defaultPlatformIds: z.array(z.enum(PLATFORM_IDS)).min(1).max(5),
    defaultLocaleId: z.enum(CONTENT_LOCALES),
    defaultSkillIds: z
      .array(z.string().regex(/^(?:builtin|custom)\.[a-z0-9._-]{2,80}$/))
      .max(8),
    confirmAction: cardActionSchema,
  })
  .strict();

export const ideaCandidatesCardSchema = z
  .object({
    ...cardBase,
    type: z.literal("idea_candidates"),
    brief: z.string().trim().min(1).max(12000),
    direction: z.string().trim().min(1).max(200),
    uiLocale: z.enum(["zh-CN", "en-US"]),
    candidates: z
      .array(
        z
          .object({
            id: stableIdSchema,
            title: z.string().trim().min(1).max(160),
            angle: z.string().trim().min(1).max(800),
            audience: z.string().trim().min(1).max(300),
            reason: z.string().trim().min(1).max(500),
          })
          .strict(),
      )
      .min(2)
      .max(6),
    chooseAction: cardActionSchema,
    skipAction: cardActionSchema,
  })
  .strict();

export const referenceCardSchema = z
  .object({
    ...cardBase,
    type: z.literal("reference"),
    state: z.enum(["importing", "ready", "needs_input", "failed"]),
    sourceUrl: httpUrlSchema,
    platform: z.enum([...PLATFORM_IDS, "web"]).optional(),
    jobId: z.string().min(1).max(64).optional(),
    reference: entityRefSchema.optional(),
    author: z.string().max(120).optional(),
    coverUrl: httpUrlSchema.optional(),
    summary: z.string().max(2000).optional(),
    evidence: z
      .array(
        z
          .object({ label: z.string().min(1).max(120), excerpt: z.string().max(1000) })
          .strict(),
      )
      .max(20)
      .optional(),
    actions: z.array(cardActionSchema).max(8).optional(),
  })
  .strict();

export const progressCardSchema = z
  .object({
    ...cardBase,
    type: z.literal("progress"),
    jobId: z.string().min(1).max(64),
    title: z.string().min(1).max(200),
    display: z.enum(["compact", "steps"]),
    cancelable: z.boolean().optional(),
  })
  .strict();

export const artifactCardSchema = z
  .object({
    ...cardBase,
    type: z.literal("artifact"),
    contentId: z.string().min(1).max(64),
    revisionId: z.string().min(1).max(64),
    revisionNumber: z.number().int().positive(),
    platform: z.enum(PLATFORM_IDS),
    contentKind: z.enum(CONTENT_KIND_IDS),
    contentLocale: z.enum(CONTENT_LOCALES).optional(),
    title: z.string().min(1).max(200),
    preview: z.string().max(4000).optional(),
    score: z.number().min(0).max(100).optional(),
    actions: z.array(cardActionSchema).min(1).max(8),
  })
  .strict();

export const approvalCardSchema = z
  .object({
    ...cardBase,
    type: z.literal("approval"),
    title: z.string().min(1).max(200),
    summary: z.string().min(1).max(2000),
    risk: z.enum(["low", "medium", "high"]),
    confirmAction: cardActionSchema,
    cancelAction: cardActionSchema,
  })
  .strict();

export const noticeCardSchema = z
  .object({
    ...cardBase,
    type: z.literal("notice"),
    tone: z.enum(["info", "warning", "error", "success"]),
    title: z.string().min(1).max(200),
    body: z.string().max(4000).optional(),
    reference: entityRefSchema.optional(),
    actions: z.array(cardActionSchema).max(8).optional(),
  })
  .strict();

export const patchCardSchema = z
  .object({
    ...cardBase,
    type: z.literal("patch"),
    contentId: z.string().min(1).max(64),
    revisionId: z.string().min(1).max(64),
    revisionNumber: z.number().int().positive(),
    contentKind: z.enum(["xhs_graphic", "douyin_video_script"]),
    section: z
      .object({
        kind: z.enum([
          "title",
          "body",
          "hook",
          "interaction",
          "page",
          "shot",
        ]),
        index: z.number().int().min(0).max(999).optional(),
      })
      .strict(),
    sectionLabel: z.string().min(1).max(120),
    skillId: z.string().regex(/^[a-z][a-z0-9._-]{1,63}$/),
    instruction: z.string().min(1).max(2000),
    before: z.string().max(4000),
    after: z.string().max(4000),
    note: z.string().max(500).optional(),
    origin: z.literal("local_preview"),
    actions: z.array(cardActionSchema).min(1).max(8),
  })
  .strict();

/**
 * publish.prepare 发布就绪卡(C8)。
 * items 由服务端从用户所属版本计算;connection 只是凭证的本地配置状态。
 * 确认动作在服务端会按 revisionId 重新校验,不信任卡片自带结论。
 */
export const publishReadinessCardSchema = z
  .object({
    ...cardBase,
    type: z.literal("publish_readiness"),
    contentId: z.string().min(1).max(64),
    revisionId: z.string().min(1).max(64),
    revisionNumber: z.number().int().positive(),
    platform: z.enum(PLATFORM_IDS),
    contentKind: z.enum(CONTENT_KIND_IDS),
    title: z.string().min(1).max(200),
    state: z.enum(["ready", "warnings", "blocked"]),
    connection: z.enum(["connected", "missing", "invalid", "not_applicable"]),
    items: z
      .array(
        z
          .object({
            key: stableIdSchema,
            label: z.string().min(1).max(60),
            level: z.enum(["pass", "warn", "block"]),
            detail: z.string().max(500).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(24),
    actions: z.array(cardActionSchema).min(1).max(8),
  })
  .strict();

export const chatCardSchema = z.discriminatedUnion("type", [
  optionCardSchema,
  creationSetupCardSchema,
  ideaCandidatesCardSchema,
  referenceCardSchema,
  progressCardSchema,
  artifactCardSchema,
  approvalCardSchema,
  noticeCardSchema,
  patchCardSchema,
  publishReadinessCardSchema,
]) satisfies z.ZodType<ChatCard>;

export const chatMessageMetadataV1Schema = z
  .object({
    protocol: z.literal(CHAT_PROTOCOL),
    cards: z.array(chatCardSchema).max(20),
    runId: z.string().min(1).max(64).optional(),
  })
  .strict() satisfies z.ZodType<ChatMessageMetadataV1>;

export const agentCommandSchema = z.enum(AGENT_COMMANDS);

/**
 * 读取 Message.metadata:
 * - 合法 star-chat/v1 → 返回结构化元数据;
 * - 旧数据 / null / 其他形状 → 返回 null,调用方回退到纯文本正文。
 */
export function parseChatMessageMetadata(value: unknown): ChatMessageMetadataV1 | null {
  const result = chatMessageMetadataV1Schema.safeParse(value);
  return result.success ? result.data : null;
}

/**
 * 选中区块修改目标(C7):客户端只提交区块引用与摘录;
 * 服务端自行解析最新版本并从用户所属内容读取真实文本,
 * 不信任客户端提交的任何正文或版本号。
 */
export const patchTargetSchema = z
  .object({
    contentId: z.string().min(1).max(64),
    section: z
      .object({
        kind: z.enum(["title", "body", "hook", "interaction", "page", "shot"]),
        index: z.number().int().min(0).max(999).optional(),
      })
      .strict(),
    excerpt: z.string().max(500).optional(),
    skillId: z
      .string()
      .regex(/^[a-z][a-z0-9._-]{1,63}$/)
      .optional(),
  })
  .strict();

export type PatchTarget = z.infer<typeof patchTargetSchema>;

/**
 * 发布准备目标(C8):Artifact「准备发布」随消息提交内容 ID;
 * 服务端只信任内容归属校验后的数据库记录,就绪结论完全由服务端计算。
 */
export const publishTargetSchema = z
  .object({
    contentId: z.string().min(1).max(64),
  })
  .strict();

export type PublishTarget = z.infer<typeof publishTargetSchema>;

/** 发送消息请求(C3 API 将使用;此处先固定协议形状)。 */
export const sendMessageRequestSchema = z
  .object({
    clientMessageId: stableIdSchema,
    parts: z
      .array(
        z.discriminatedUnion("type", [
          z.object({ type: z.literal("text"), text: z.string().min(1).max(12000) }).strict(),
          z.object({ type: z.literal("reference_url"), url: httpUrlSchema }).strict(),
          z.object({ type: z.literal("entity"), reference: entityRefSchema }).strict(),
        ]),
      )
      .min(1)
      .max(10),
    context: z
      .object({
        platform: z.enum(PLATFORM_IDS).optional(),
        platforms: z.array(z.enum(PLATFORM_IDS)).min(1).max(5).optional(),
        targetLocale: z.enum(CONTENT_LOCALES).optional(),
        contentId: z.string().min(1).max(64).optional(),
        personaId: z.string().min(1).max(64).optional(),
        styleProfileId: z.string().min(1).max(64).optional(),
        skillIds: z
          .array(
            z.string().regex(/^(?:builtin|custom)\.[a-z0-9._-]{2,80}$/),
          )
          .max(8)
          .optional(),
        patchTarget: patchTargetSchema.optional(),
        publishTarget: publishTargetSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

/** 卡片动作回传:只允许标识符与用户选择值,不允许任意载荷。 */
export const invokeCardActionRequestSchema = z
  .object({
    clientActionId: stableIdSchema,
    sourceMessageId: z.string().min(1).max(64),
    cardId: stableIdSchema,
    actionId: stableIdSchema,
    values: z
      .object({
        optionIds: z.array(stableIdSchema).max(20).optional(),
        text: z.string().max(4000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type InvokeCardActionRequest = z.infer<typeof invokeCardActionRequestSchema>;
