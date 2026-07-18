-- CreateEnum
CREATE TYPE "CreativeDirectionStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "DirectionDecisionStatus" AS ENUM ('recommended', 'confirmed', 'superseded');

-- CreateEnum
CREATE TYPE "DirectionCandidateStatus" AS ENUM ('pending', 'approved', 'rejected', 'archived');

-- CreateEnum
CREATE TYPE "DirectionReviewStage" AS ENUM ('generation', 'publish');

-- CreateEnum
CREATE TYPE "DirectionReviewStatus" AS ENUM ('passed', 'needs_attention', 'unavailable');

-- AlterTable
ALTER TABLE "ConversationContextVersion" ADD COLUMN "creativeDirectionSnapshot" JSONB;

-- CreateTable
CREATE TABLE "CreativeDirectionDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "CreativeDirectionStatus" NOT NULL DEFAULT 'draft',
    "category" TEXT NOT NULL,
    "zhLabel" TEXT NOT NULL,
    "enLabel" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "manifest" JSONB NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreativeDirectionDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeDirectionDecision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "sourceMessageId" TEXT,
    "inputHash" TEXT NOT NULL,
    "catalogFingerprint" TEXT NOT NULL,
    "status" "DirectionDecisionStatus" NOT NULL DEFAULT 'recommended',
    "analysis" JSONB NOT NULL,
    "selectedPrimary" JSONB,
    "selectedSecondary" JSONB,
    "modelProvider" TEXT,
    "modelName" TEXT,
    "promptVersion" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreativeDirectionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeDirectionCandidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" "DirectionCandidateStatus" NOT NULL DEFAULT 'pending',
    "manifest" JSONB NOT NULL,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CreativeDirectionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDirectionReview" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "stage" "DirectionReviewStage" NOT NULL,
    "status" "DirectionReviewStatus" NOT NULL,
    "inputHash" TEXT NOT NULL,
    "directionSnapshot" JSONB NOT NULL,
    "result" JSONB,
    "modelProvider" TEXT,
    "modelName" TEXT,
    "promptVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContentDirectionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CreativeDirectionDefinition_key_version_key" ON "CreativeDirectionDefinition"("key", "version");
CREATE INDEX "CreativeDirectionDefinition_status_category_idx" ON "CreativeDirectionDefinition"("status", "category");
CREATE INDEX "CreativeDirectionDefinition_key_status_idx" ON "CreativeDirectionDefinition"("key", "status");
CREATE UNIQUE INDEX "CreativeDirectionDecision_conversationId_inputHash_key" ON "CreativeDirectionDecision"("conversationId", "inputHash");
CREATE INDEX "CreativeDirectionDecision_userId_createdAt_idx" ON "CreativeDirectionDecision"("userId", "createdAt");
CREATE INDEX "CreativeDirectionDecision_conversationId_status_updatedAt_idx" ON "CreativeDirectionDecision"("conversationId", "status", "updatedAt");
CREATE UNIQUE INDEX "CreativeDirectionCandidate_decisionId_fingerprint_key" ON "CreativeDirectionCandidate"("decisionId", "fingerprint");
CREATE INDEX "CreativeDirectionCandidate_status_createdAt_idx" ON "CreativeDirectionCandidate"("status", "createdAt");
CREATE INDEX "CreativeDirectionCandidate_userId_createdAt_idx" ON "CreativeDirectionCandidate"("userId", "createdAt");
CREATE UNIQUE INDEX "ContentDirectionReview_revisionId_stage_inputHash_key" ON "ContentDirectionReview"("revisionId", "stage", "inputHash");
CREATE INDEX "ContentDirectionReview_userId_createdAt_idx" ON "ContentDirectionReview"("userId", "createdAt");
CREATE INDEX "ContentDirectionReview_contentId_stage_createdAt_idx" ON "ContentDirectionReview"("contentId", "stage", "createdAt");

-- AddForeignKey
ALTER TABLE "CreativeDirectionDecision" ADD CONSTRAINT "CreativeDirectionDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreativeDirectionDecision" ADD CONSTRAINT "CreativeDirectionDecision_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreativeDirectionCandidate" ADD CONSTRAINT "CreativeDirectionCandidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreativeDirectionCandidate" ADD CONSTRAINT "CreativeDirectionCandidate_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CreativeDirectionCandidate" ADD CONSTRAINT "CreativeDirectionCandidate_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "CreativeDirectionDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentDirectionReview" ADD CONSTRAINT "ContentDirectionReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentDirectionReview" ADD CONSTRAINT "ContentDirectionReview_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "GeneratedContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentDirectionReview" ADD CONSTRAINT "ContentDirectionReview_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ContentRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
