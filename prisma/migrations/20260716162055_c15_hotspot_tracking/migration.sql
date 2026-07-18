-- CreateEnum
CREATE TYPE "TrackingOrigin" AS ENUM ('system_publish', 'external_import');

-- CreateEnum
CREATE TYPE "TrackingOwnership" AS ENUM ('owned', 'reference');

-- CreateEnum
CREATE TYPE "TrackingStatus" AS ENUM ('pending', 'active', 'paused', 'connection_required', 'unavailable');

-- CreateEnum
CREATE TYPE "TrackingMetricSource" AS ENUM ('provider', 'public_api', 'manual', 'system');

-- CreateEnum
CREATE TYPE "TrackingAnalysisStatus" AS ENUM ('completed', 'limited', 'failed');

-- AlterEnum
ALTER TYPE "CredentialProvider" ADD VALUE 'youtube_data';

-- CreateTable
CREATE TABLE "HotspotAiInsight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "sourceDigest" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "lifecycle" TEXT NOT NULL,
    "audience" TEXT,
    "summary" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "relevanceScore" INTEGER NOT NULL,
    "opportunityScore" INTEGER NOT NULL,
    "saturationScore" INTEGER NOT NULL,
    "suggestedAngles" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "inputSnapshot" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotspotAiInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "displayName" TEXT,
    "handle" TEXT,
    "encryptedPayload" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "CredentialStatus" NOT NULL DEFAULT 'active',
    "tokenExpiresAt" TIMESTAMP(3),
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedPublication" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform",
    "sourceKind" TEXT NOT NULL,
    "origin" "TrackingOrigin" NOT NULL DEFAULT 'external_import',
    "ownership" "TrackingOwnership" NOT NULL DEFAULT 'owned',
    "status" "TrackingStatus" NOT NULL DEFAULT 'pending',
    "contentId" TEXT,
    "publishRecordId" TEXT,
    "socialConnectionId" TEXT,
    "platformContentId" TEXT,
    "publicUrl" TEXT NOT NULL,
    "urlFingerprint" TEXT NOT NULL,
    "title" TEXT,
    "excerpt" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "nextSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackedMetricSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackedPublicationId" TEXT NOT NULL,
    "source" "TrackingMetricSource" NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER,
    "likeCount" INTEGER,
    "collectCount" INTEGER,
    "commentCount" INTEGER,
    "shareCount" INTEGER,
    "saveCount" INTEGER,
    "clickCount" INTEGER,
    "followerDelta" INTEGER,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackedMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackedPublicationId" TEXT NOT NULL,
    "status" "TrackingAnalysisStatus" NOT NULL,
    "summary" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "recommendations" JSONB NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotspotAiInsight_userId_updatedAt_idx" ON "HotspotAiInsight"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "HotspotAiInsight_userId_opportunityScore_updatedAt_idx" ON "HotspotAiInsight"("userId", "opportunityScore", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HotspotAiInsight_userId_fingerprint_promptVersion_key" ON "HotspotAiInsight"("userId", "fingerprint", "promptVersion");

-- CreateIndex
CREATE INDEX "SocialConnection_userId_status_updatedAt_idx" ON "SocialConnection"("userId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SocialConnection_userId_platform_externalAccountId_key" ON "SocialConnection"("userId", "platform", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedPublication_publishRecordId_key" ON "TrackedPublication"("publishRecordId");

-- CreateIndex
CREATE INDEX "TrackedPublication_userId_status_nextSyncAt_idx" ON "TrackedPublication"("userId", "status", "nextSyncAt");

-- CreateIndex
CREATE INDEX "TrackedPublication_contentId_idx" ON "TrackedPublication"("contentId");

-- CreateIndex
CREATE INDEX "TrackedPublication_socialConnectionId_idx" ON "TrackedPublication"("socialConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedPublication_userId_urlFingerprint_key" ON "TrackedPublication"("userId", "urlFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedPublication_userId_platform_platformContentId_key" ON "TrackedPublication"("userId", "platform", "platformContentId");

-- CreateIndex
CREATE INDEX "TrackedMetricSnapshot_userId_observedAt_idx" ON "TrackedMetricSnapshot"("userId", "observedAt");

-- CreateIndex
CREATE INDEX "TrackedMetricSnapshot_trackedPublicationId_observedAt_idx" ON "TrackedMetricSnapshot"("trackedPublicationId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrackedMetricSnapshot_trackedPublicationId_source_bucketKey_key" ON "TrackedMetricSnapshot"("trackedPublicationId", "source", "bucketKey");

-- CreateIndex
CREATE INDEX "TrackingAnalysis_userId_createdAt_idx" ON "TrackingAnalysis"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TrackingAnalysis_trackedPublicationId_createdAt_idx" ON "TrackingAnalysis"("trackedPublicationId", "createdAt");

-- AddForeignKey
ALTER TABLE "HotspotAiInsight" ADD CONSTRAINT "HotspotAiInsight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialConnection" ADD CONSTRAINT "SocialConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedPublication" ADD CONSTRAINT "TrackedPublication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedPublication" ADD CONSTRAINT "TrackedPublication_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "GeneratedContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedPublication" ADD CONSTRAINT "TrackedPublication_publishRecordId_fkey" FOREIGN KEY ("publishRecordId") REFERENCES "PublishRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedPublication" ADD CONSTRAINT "TrackedPublication_socialConnectionId_fkey" FOREIGN KEY ("socialConnectionId") REFERENCES "SocialConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedMetricSnapshot" ADD CONSTRAINT "TrackedMetricSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackedMetricSnapshot" ADD CONSTRAINT "TrackedMetricSnapshot_trackedPublicationId_fkey" FOREIGN KEY ("trackedPublicationId") REFERENCES "TrackedPublication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingAnalysis" ADD CONSTRAINT "TrackingAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingAnalysis" ADD CONSTRAINT "TrackingAnalysis_trackedPublicationId_fkey" FOREIGN KEY ("trackedPublicationId") REFERENCES "TrackedPublication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
