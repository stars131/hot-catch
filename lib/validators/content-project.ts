import { ContentKind, Platform } from "@prisma/client";
import { z } from "zod";

export const createContentProjectSchema = z
  .object({
    ideaId: z.string().cuid().optional(),
    personaId: z.string().cuid().optional(),
    styleProfileId: z.string().cuid().optional(),
    platform: z.nativeEnum(Platform),
    contentKind: z.nativeEnum(ContentKind),
    title: z.string().trim().max(200).optional(),
    inputText: z.string().trim().max(12000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.platform === "xiaohongshu" && value.contentKind !== "xhs_graphic") {
      ctx.addIssue({ code: "custom", message: "小红书项目必须使用图文类型。" });
    }
    if (value.platform === "douyin" && value.contentKind !== "douyin_video_script") {
      ctx.addIssue({ code: "custom", message: "抖音项目必须使用视频脚本类型。" });
    }
  });

export const createRevisionSchema = z.object({
  source: z.enum(["generated", "manual", "restored"]).default("manual"),
  title: z.string().trim().max(200).nullable().optional(),
  bodyText: z.string().max(100000).nullable().optional(),
  structuredContent: z.unknown().optional(),
  fullMarkdown: z.string().max(150000).nullable().optional(),
});
