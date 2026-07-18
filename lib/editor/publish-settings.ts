import { z } from "zod";
import type { PlatformId } from "@/lib/platforms/registry";

export const contentPublishSettingsSchema = z.object({
  platform: z.enum([
    "xiaohongshu",
    "douyin",
    "youtube",
    "tiktok",
    "instagram",
    "x",
    "reddit",
  ]),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  note: z.string().trim().max(500),
  visibility: z.enum(["public", "followers", "unlisted", "private"]),
  allowComments: z.boolean(),
  contentDisclosure: z.enum(["none", "ai_generated", "commercial"]),
  coverMode: z.enum(["first_frame", "first_image", "custom"]),
  audience: z.enum(["general", "made_for_kids", "not_made_for_kids"]),
  category: z.string().trim().max(80),
  language: z.string().trim().max(30),
  notifySubscribers: z.boolean(),
  allowDuet: z.boolean(),
  allowStitch: z.boolean(),
  brandedContent: z.boolean(),
  aiGenerated: z.boolean(),
  placement: z.enum(["feed", "reels"]),
  aspectRatio: z.enum(["1:1", "4:5", "9:16"]),
  hideLikeCount: z.boolean(),
  altText: z.string().trim().max(1000),
  replyPermission: z.enum(["everyone", "following", "mentioned"]),
  sensitiveMedia: z.boolean(),
  numberThread: z.boolean(),
  subreddit: z.string().trim().max(80),
  flair: z.string().trim().max(80),
  postType: z.enum(["text", "link", "image"]),
  nsfw: z.boolean(),
  spoiler: z.boolean(),
  sendReplies: z.boolean(),
}).strict();

export type ContentPublishSettings = z.infer<typeof contentPublishSettingsSchema>;

const BASE_SETTINGS: Omit<ContentPublishSettings, "platform"> = {
  scheduledAt: null,
  note: "",
  visibility: "public",
  allowComments: true,
  contentDisclosure: "none",
  coverMode: "first_frame",
  audience: "general",
  category: "",
  language: "",
  notifySubscribers: true,
  allowDuet: true,
  allowStitch: true,
  brandedContent: false,
  aiGenerated: false,
  placement: "feed",
  aspectRatio: "4:5",
  hideLikeCount: false,
  altText: "",
  replyPermission: "everyone",
  sensitiveMedia: false,
  numberThread: false,
  subreddit: "",
  flair: "",
  postType: "text",
  nsfw: false,
  spoiler: false,
  sendReplies: true,
};

export function defaultContentPublishSettings(platform: PlatformId): ContentPublishSettings {
  const settings: ContentPublishSettings = { ...BASE_SETTINGS, platform };
  if (platform === "xiaohongshu") settings.coverMode = "first_image";
  if (platform === "youtube") {
    settings.visibility = "private";
    settings.audience = "not_made_for_kids";
    settings.aspectRatio = "9:16";
  }
  if (platform === "tiktok" || platform === "douyin") settings.aspectRatio = "9:16";
  if (platform === "instagram") settings.placement = "feed";
  return settings;
}
