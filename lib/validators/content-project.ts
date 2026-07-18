import { z } from "zod";
import {
  CONTENT_KIND_IDS,
  CONTENT_LOCALES,
  PLATFORM_IDS,
  isContentKindId,
  isPlatformId,
  platformSupportsContentKind,
} from "@/lib/platforms/registry";

export const createContentProjectSchema = z
  .object({
    ideaId: z.string().cuid().optional(),
    personaId: z.string().cuid().optional(),
    styleProfileId: z.string().cuid().optional(),
    platform: z.enum(PLATFORM_IDS),
    contentKind: z.enum(CONTENT_KIND_IDS),
    contentLocale: z.enum(CONTENT_LOCALES).default("zh-CN"),
    title: z.string().trim().max(200).optional(),
    inputText: z.string().trim().max(12000).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      isPlatformId(value.platform) &&
      isContentKindId(value.contentKind) &&
      !platformSupportsContentKind(value.platform, value.contentKind)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["contentKind"],
        message: "平台与内容格式不匹配。",
      });
    }
  });

export const createRevisionSchema = z.object({
  source: z.enum(["generated", "manual", "restored"]).default("manual"),
  title: z.string().trim().max(200).nullable().optional(),
  bodyText: z.string().max(100000).nullable().optional(),
  structuredContent: z.unknown().optional(),
  fullMarkdown: z.string().max(150000).nullable().optional(),
  expectedRevisionId: z.string().cuid().optional().nullable(),
  expectedChecksum: z.string().regex(/^[a-f0-9]{64}$/).optional().nullable(),
});

/** 恢复版本:客户端只提交来源版本 ID,payload 一律由服务端从该版本读取。 */
export const restoreRevisionSchema = z
  .object({
    source: z.literal("restored"),
    fromRevisionId: z.string().cuid(),
  })
  .strict();

export const revisionRequestSchema = z.union([
  restoreRevisionSchema,
  createRevisionSchema,
]);
