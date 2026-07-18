-- Persist per-content publishing preparation settings used by the editor center.
CREATE TABLE "ContentPublishSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPublishSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentPublishSetting_contentId_key"
ON "ContentPublishSetting"("contentId");

CREATE INDEX "ContentPublishSetting_userId_platform_updatedAt_idx"
ON "ContentPublishSetting"("userId", "platform", "updatedAt");

ALTER TABLE "ContentPublishSetting"
ADD CONSTRAINT "ContentPublishSetting_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContentPublishSetting"
ADD CONSTRAINT "ContentPublishSetting_contentId_fkey"
FOREIGN KEY ("contentId") REFERENCES "GeneratedContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
