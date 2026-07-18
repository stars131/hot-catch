-- C14A compatibility migration: add the five export-only foreign platforms
-- before exposing them in the creator UI. Existing rows remain zh-CN and the
-- previous xiaohongshu/douyin values are unchanged.
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'youtube';
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'tiktok';
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'instagram';
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'x';
ALTER TYPE "Platform" ADD VALUE IF NOT EXISTS 'reddit';

ALTER TYPE "ContentKind" ADD VALUE IF NOT EXISTS 'youtube_video_package';
ALTER TYPE "ContentKind" ADD VALUE IF NOT EXISTS 'tiktok_short_video_script';
ALTER TYPE "ContentKind" ADD VALUE IF NOT EXISTS 'instagram_carousel';
ALTER TYPE "ContentKind" ADD VALUE IF NOT EXISTS 'x_thread';
ALTER TYPE "ContentKind" ADD VALUE IF NOT EXISTS 'reddit_post';

ALTER TABLE "Conversation"
  ADD COLUMN "targetPlatforms" "Platform"[] NOT NULL DEFAULT ARRAY[]::"Platform"[],
  ADD COLUMN "targetLocale" TEXT NOT NULL DEFAULT 'zh-CN';

ALTER TABLE "GeneratedContent"
  ADD COLUMN "contentLocale" TEXT NOT NULL DEFAULT 'zh-CN';
