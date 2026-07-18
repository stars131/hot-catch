import { Prisma, type Platform } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import {
  contentPublishSettingsSchema,
  defaultContentPublishSettings,
  type ContentPublishSettings,
} from "@/lib/editor/publish-settings";
import type { PlatformId } from "@/lib/platforms/registry";

async function requireOwnedContent(userId: string, contentId: string) {
  const content = await prisma.generatedContent.findFirst({
    where: { id: contentId, userId },
    select: { id: true, platform: true },
  });
  if (!content) throw new AppError("NOT_FOUND", "内容项目不存在。", 404);
  return content;
}

export async function getContentPublishSettings(userId: string, contentId: string) {
  const content = await requireOwnedContent(userId, contentId);
  const saved = await prisma.contentPublishSetting.findUnique({
    where: { contentId },
    select: { settings: true, updatedAt: true },
  });
  const parsed = saved ? contentPublishSettingsSchema.safeParse(saved.settings) : null;
  const platform = content.platform as PlatformId;
  const settings = parsed?.success && parsed.data.platform === platform
    ? parsed.data
    : defaultContentPublishSettings(platform);
  return { settings, updatedAt: saved?.updatedAt ?? null };
}

export async function saveContentPublishSettings(
  userId: string,
  contentId: string,
  input: ContentPublishSettings,
) {
  const content = await requireOwnedContent(userId, contentId);
  const settings = contentPublishSettingsSchema.parse(input);
  if (settings.platform !== content.platform) {
    throw new AppError("VALIDATION_ERROR", "发布设置的平台与内容平台不一致。", 422);
  }
  const saved = await prisma.contentPublishSetting.upsert({
    where: { contentId },
    create: {
      userId,
      contentId,
      platform: content.platform as Platform,
      settings: settings as unknown as Prisma.InputJsonValue,
    },
    update: {
      platform: content.platform as Platform,
      settings: settings as unknown as Prisma.InputJsonValue,
    },
    select: { settings: true, updatedAt: true },
  });
  return {
    settings: contentPublishSettingsSchema.parse(saved.settings),
    updatedAt: saved.updatedAt,
  };
}
