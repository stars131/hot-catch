import { z } from "zod";
import {
  AGENT_COMMANDS,
  CHAT_PROTOCOL,
  type ChatCard,
  type ChatMessageMetadataV1,
} from "@/lib/creator/chat-protocol";

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
  })
  .strict();

export const referenceCardSchema = z
  .object({
    ...cardBase,
    type: z.literal("reference"),
    state: z.enum(["importing", "ready", "needs_input", "failed"]),
    sourceUrl: httpUrlSchema,
    platform: z.enum(["xiaohongshu", "douyin", "web"]).optional(),
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
    platform: z.enum(["xiaohongshu", "douyin"]),
    contentKind: z.enum(["xhs_graphic", "douyin_video_script"]),
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
    actions: z.array(cardActionSchema).max(8).optional(),
  })
  .strict();

export const chatCardSchema = z.discriminatedUnion("type", [
  optionCardSchema,
  referenceCardSchema,
  progressCardSchema,
  artifactCardSchema,
  approvalCardSchema,
  noticeCardSchema,
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
        platform: z.enum(["xiaohongshu", "douyin"]).optional(),
        contentId: z.string().min(1).max(64).optional(),
        personaId: z.string().min(1).max(64).optional(),
        styleProfileId: z.string().min(1).max(64).optional(),
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
