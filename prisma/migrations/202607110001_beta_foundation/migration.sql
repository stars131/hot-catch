-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('xiaohongshu', 'douyin');

-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('xhs_graphic', 'douyin_video_script');

-- CreateEnum
CREATE TYPE "FetchStatus" AS ENUM ('pending', 'success', 'failed', 'partial', 'manual_required');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system', 'tool');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'saved', 'abandoned', 'published');

-- CreateEnum
CREATE TYPE "InputType" AS ENUM ('xhs_id', 'xhs_profile_url', 'xhs_note_url', 'douyin_profile_url', 'douyin_video_url', 'topic', 'idea', 'draft', 'command', 'unknown');

-- CreateEnum
CREATE TYPE "AnalysisType" AS ENUM ('single_account', 'multiple_accounts', 'fusion');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "CredentialProvider" AS ENUM ('tikhub', 'qwen_asr', 'aitoearn', 'deepseek', 'firecrawl', 'xiaohongshu_cookie');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('active', 'invalid', 'revoked');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('ingest', 'analysis', 'publish', 'metrics');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'waiting_input', 'succeeded', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "IdeaSource" AS ENUM ('hotspot', 'manual', 'reference');

-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('saved', 'planning', 'creating', 'published', 'archived');

-- CreateEnum
CREATE TYPE "StyleProfileStatus" AS ENUM ('draft', 'in_review', 'approved', 'archived');

-- CreateEnum
CREATE TYPE "RevisionSource" AS ENUM ('generated', 'manual', 'restored');

-- CreateEnum
CREATE TYPE "RubricStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('draft', 'scheduled', 'uploading', 'submitted', 'awaiting_user', 'published', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "MetricWindow" AS ENUM ('d1', 'd3', 'd7', 'manual');

-- CreateEnum
CREATE TYPE "RetrospectiveStatus" AS ENUM ('pending', 'drafted', 'accepted', 'dismissed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CredentialProvider" NOT NULL,
    "encryptedPayload" TEXT NOT NULL,
    "keyHint" TEXT,
    "status" "CredentialStatus" NOT NULL DEFAULT 'active',
    "metadata" JSONB,
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessingJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "queueName" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "resultType" TEXT,
    "resultId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "providerJobId" TEXT,
    "idempotencyKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "accountName" TEXT,
    "niche" TEXT,
    "creatorIdentity" TEXT,
    "targetAudience" TEXT,
    "contentStyle" TEXT,
    "learningAccounts" TEXT,
    "avoidTopics" TEXT,
    "businessGoal" TEXT,
    "ageStage" TEXT,
    "city" TEXT,
    "accountStatus" TEXT,
    "followerCount" INTEGER,
    "updateFrequency" TEXT,
    "monetizationType" TEXT,
    "personalExperience" TEXT,
    "expressionBoundary" TEXT,
    "forbiddenTopics" TEXT,
    "valuesKeywords" TEXT,
    "commonPhrases" TEXT,
    "accountGoal" TEXT,
    "personalStrengths" TEXT,
    "personalWeaknesses" TEXT,
    "sustainableTopics" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL DEFAULT 'xiaohongshu',
    "platformAccountId" TEXT,
    "xhsId" TEXT,
    "nickname" TEXT,
    "avatarUrl" TEXT,
    "profileUrl" TEXT,
    "description" TEXT,
    "category" TEXT,
    "followerCount" INTEGER,
    "followingCount" INTEGER,
    "likedCount" INTEGER,
    "noteCount" INTEGER,
    "rawData" JSONB,
    "sourceType" TEXT,
    "sourceUrl" TEXT,
    "dataConfidence" DOUBLE PRECISION,
    "fetchStatus" "FetchStatus" NOT NULL DEFAULT 'pending',
    "lastFetchedAt" TIMESTAMP(3),
    "userRemark" TEXT,
    "groupName" TEXT,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkNote" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "noteId" TEXT,
    "platformContentId" TEXT,
    "noteUrl" TEXT,
    "title" TEXT,
    "content" TEXT,
    "contentType" TEXT,
    "coverUrl" TEXT,
    "durationSec" INTEGER,
    "transcript" TEXT,
    "analysis" JSONB,
    "publishTime" TIMESTAMP(3),
    "likeCount" INTEGER,
    "collectCount" INTEGER,
    "commentCount" INTEGER,
    "shareCount" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawData" JSONB,
    "sourceType" TEXT,
    "dataConfidence" DOUBLE PRECISION,
    "metricsUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "analysisType" "AnalysisType" NOT NULL,
    "positioning" TEXT,
    "targetAudience" TEXT,
    "frequentTopics" JSONB,
    "titlePatterns" JSONB,
    "coverStyle" TEXT,
    "contentStructure" TEXT,
    "languageStyle" TEXT,
    "interactionStyle" TEXT,
    "personaExpression" TEXT,
    "learnablePoints" JSONB,
    "avoidPoints" JSONB,
    "userAdaptation" TEXT,
    "fullReport" TEXT,
    "modelName" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenchmarkAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendTopic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "category" TEXT,
    "currentRank" INTEGER,
    "currentScore" DOUBLE PRECISION,
    "firstObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrendTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrendObservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trendTopicId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "rank" INTEGER,
    "score" DOUBLE PRECISION,
    "metrics" JSONB,
    "evidence" JSONB,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trendTopicId" TEXT,
    "platform" "Platform",
    "source" "IdeaSource" NOT NULL DEFAULT 'manual',
    "status" "IdeaStatus" NOT NULL DEFAULT 'saved',
    "title" TEXT NOT NULL,
    "angle" TEXT,
    "audience" TEXT,
    "notes" TEXT,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorStyleProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "StyleProfileStatus" NOT NULL DEFAULT 'draft',
    "summary" TEXT,
    "themes" JSONB,
    "hooks" JSONB,
    "pacing" JSONB,
    "tone" JSONB,
    "visualLanguage" JSONB,
    "boundaries" JSONB,
    "confidence" DOUBLE PRECISION,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorStyleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StyleEvidence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "styleProfileId" TEXT NOT NULL,
    "benchmarkNoteId" TEXT,
    "platformContentId" TEXT,
    "sourceUrl" TEXT,
    "excerpt" TEXT,
    "insight" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StyleEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedContent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "personaId" TEXT,
    "ideaId" TEXT,
    "styleProfileId" TEXT,
    "scoringRubricId" TEXT,
    "platform" "Platform" NOT NULL DEFAULT 'xiaohongshu',
    "contentKind" "ContentKind" NOT NULL DEFAULT 'xhs_graphic',
    "title" TEXT,
    "inputType" "InputType",
    "inputText" TEXT,
    "selectedAccountIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outputType" TEXT NOT NULL DEFAULT 'xhs_graphic',
    "generatedTitleOptions" JSONB,
    "coverTextOptions" JSONB,
    "pageStructure" JSONB,
    "scriptSpec" JSONB,
    "bodyText" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interactionEnding" TEXT,
    "benchmarkExplanation" TEXT,
    "riskNotes" TEXT,
    "fullMarkdown" TEXT,
    "scoreSnapshot" JSONB,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "modelName" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentRevision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "source" "RevisionSource" NOT NULL DEFAULT 'manual',
    "title" TEXT,
    "bodyText" TEXT,
    "structuredContent" JSONB,
    "fullMarkdown" TEXT,
    "checksum" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoringRubric" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "contentKind" "ContentKind" NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "RubricStatus" NOT NULL DEFAULT 'draft',
    "rules" JSONB NOT NULL,
    "backtestResult" JSONB,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoringRubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "revisionId" TEXT,
    "platform" "Platform" NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'draft',
    "provider" TEXT NOT NULL DEFAULT 'aitoearn',
    "providerAccountId" TEXT,
    "providerFlowId" TEXT,
    "providerRecordId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "shortLink" TEXT,
    "publicUrl" TEXT,
    "requestPayload" JSONB,
    "providerResponse" JSONB,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "publishRecordId" TEXT NOT NULL,
    "window" "MetricWindow" NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER,
    "likeCount" INTEGER,
    "collectCount" INTEGER,
    "commentCount" INTEGER,
    "shareCount" INTEGER,
    "followerDelta" INTEGER,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retrospective" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "publishRecordId" TEXT,
    "scoringRubricId" TEXT,
    "status" "RetrospectiveStatus" NOT NULL DEFAULT 'pending',
    "dueAt" TIMESTAMP(3),
    "predictedScore" JSONB,
    "actualOutcome" JSONB,
    "variance" JSONB,
    "conclusions" TEXT,
    "ruleProposal" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Retrospective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FetchLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "input" TEXT NOT NULL,
    "inputType" "InputType" NOT NULL,
    "status" "FetchStatus" NOT NULL,
    "resultType" TEXT,
    "errorMessage" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FetchLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptTemplate" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCallLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "modelName" TEXT,
    "promptType" TEXT NOT NULL,
    "promptVersion" TEXT,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_email_key" ON "Invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_acceptedByUserId_key" ON "Invitation"("acceptedByUserId");

-- CreateIndex
CREATE INDEX "Invitation_status_expiresAt_idx" ON "Invitation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ProviderCredential_userId_status_idx" ON "ProviderCredential"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCredential_userId_provider_key" ON "ProviderCredential"("userId", "provider");

-- CreateIndex
CREATE INDEX "ProcessingJob_userId_status_createdAt_idx" ON "ProcessingJob"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProcessingJob_queueName_status_idx" ON "ProcessingJob"("queueName", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessingJob_userId_type_idempotencyKey_key" ON "ProcessingJob"("userId", "type", "idempotencyKey");

-- CreateIndex
CREATE INDEX "BenchmarkAccount_userId_platform_idx" ON "BenchmarkAccount"("userId", "platform");

-- CreateIndex
CREATE INDEX "BenchmarkAccount_xhsId_idx" ON "BenchmarkAccount"("xhsId");

-- CreateIndex
CREATE INDEX "BenchmarkAccount_profileUrl_idx" ON "BenchmarkAccount"("profileUrl");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkAccount_userId_platform_platformAccountId_key" ON "BenchmarkAccount"("userId", "platform", "platformAccountId");

-- CreateIndex
CREATE INDEX "BenchmarkNote_accountId_idx" ON "BenchmarkNote"("accountId");

-- CreateIndex
CREATE INDEX "BenchmarkNote_noteId_idx" ON "BenchmarkNote"("noteId");

-- CreateIndex
CREATE INDEX "BenchmarkNote_platformContentId_idx" ON "BenchmarkNote"("platformContentId");

-- CreateIndex
CREATE INDEX "BenchmarkNote_noteUrl_idx" ON "BenchmarkNote"("noteUrl");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkNote_accountId_platformContentId_key" ON "BenchmarkNote"("accountId", "platformContentId");

-- CreateIndex
CREATE INDEX "BenchmarkAnalysis_userId_idx" ON "BenchmarkAnalysis"("userId");

-- CreateIndex
CREATE INDEX "BenchmarkAnalysis_accountId_idx" ON "BenchmarkAnalysis"("accountId");

-- CreateIndex
CREATE INDEX "TrendTopic_userId_lastObservedAt_idx" ON "TrendTopic"("userId", "lastObservedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrendTopic_userId_platform_normalizedKey_key" ON "TrendTopic"("userId", "platform", "normalizedKey");

-- CreateIndex
CREATE INDEX "TrendObservation_userId_observedAt_idx" ON "TrendObservation"("userId", "observedAt");

-- CreateIndex
CREATE INDEX "TrendObservation_trendTopicId_observedAt_idx" ON "TrendObservation"("trendTopicId", "observedAt");

-- CreateIndex
CREATE INDEX "Idea_userId_status_updatedAt_idx" ON "Idea"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Idea_trendTopicId_idx" ON "Idea"("trendTopicId");

-- CreateIndex
CREATE INDEX "CreatorStyleProfile_userId_platform_status_idx" ON "CreatorStyleProfile"("userId", "platform", "status");

-- CreateIndex
CREATE INDEX "StyleEvidence_userId_styleProfileId_idx" ON "StyleEvidence"("userId", "styleProfileId");

-- CreateIndex
CREATE INDEX "StyleEvidence_benchmarkNoteId_idx" ON "StyleEvidence"("benchmarkNoteId");

-- CreateIndex
CREATE INDEX "Conversation_userId_idx" ON "Conversation"("userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

-- CreateIndex
CREATE INDEX "GeneratedContent_userId_platform_updatedAt_idx" ON "GeneratedContent"("userId", "platform", "updatedAt");

-- CreateIndex
CREATE INDEX "GeneratedContent_conversationId_idx" ON "GeneratedContent"("conversationId");

-- CreateIndex
CREATE INDEX "GeneratedContent_ideaId_idx" ON "GeneratedContent"("ideaId");

-- CreateIndex
CREATE INDEX "ContentRevision_userId_createdAt_idx" ON "ContentRevision"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContentRevision_contentId_revisionNumber_key" ON "ContentRevision"("contentId", "revisionNumber");

-- CreateIndex
CREATE INDEX "ScoringRubric_userId_status_idx" ON "ScoringRubric"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ScoringRubric_userId_platform_contentKind_version_key" ON "ScoringRubric"("userId", "platform", "contentKind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PublishRecord_idempotencyKey_key" ON "PublishRecord"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PublishRecord_userId_status_updatedAt_idx" ON "PublishRecord"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "PublishRecord_providerRecordId_idx" ON "PublishRecord"("providerRecordId");

-- CreateIndex
CREATE INDEX "MetricSnapshot_userId_observedAt_idx" ON "MetricSnapshot"("userId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_publishRecordId_window_key" ON "MetricSnapshot"("publishRecordId", "window");

-- CreateIndex
CREATE INDEX "Retrospective_userId_status_dueAt_idx" ON "Retrospective"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Retrospective_publishRecordId_idx" ON "Retrospective"("publishRecordId");

-- CreateIndex
CREATE INDEX "FetchLog_userId_idx" ON "FetchLog"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PromptTemplate_type_version_key" ON "PromptTemplate"("type", "version");

-- CreateIndex
CREATE INDEX "AiCallLog_userId_idx" ON "AiCallLog"("userId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCredential" ADD CONSTRAINT "ProviderCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkAccount" ADD CONSTRAINT "BenchmarkAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkNote" ADD CONSTRAINT "BenchmarkNote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BenchmarkAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkAnalysis" ADD CONSTRAINT "BenchmarkAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkAnalysis" ADD CONSTRAINT "BenchmarkAnalysis_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BenchmarkAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendTopic" ADD CONSTRAINT "TrendTopic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendObservation" ADD CONSTRAINT "TrendObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrendObservation" ADD CONSTRAINT "TrendObservation_trendTopicId_fkey" FOREIGN KEY ("trendTopicId") REFERENCES "TrendTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_trendTopicId_fkey" FOREIGN KEY ("trendTopicId") REFERENCES "TrendTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorStyleProfile" ADD CONSTRAINT "CreatorStyleProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleEvidence" ADD CONSTRAINT "StyleEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleEvidence" ADD CONSTRAINT "StyleEvidence_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "CreatorStyleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StyleEvidence" ADD CONSTRAINT "StyleEvidence_benchmarkNoteId_fkey" FOREIGN KEY ("benchmarkNoteId") REFERENCES "BenchmarkNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContent" ADD CONSTRAINT "GeneratedContent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContent" ADD CONSTRAINT "GeneratedContent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContent" ADD CONSTRAINT "GeneratedContent_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContent" ADD CONSTRAINT "GeneratedContent_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "Idea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContent" ADD CONSTRAINT "GeneratedContent_styleProfileId_fkey" FOREIGN KEY ("styleProfileId") REFERENCES "CreatorStyleProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContent" ADD CONSTRAINT "GeneratedContent_scoringRubricId_fkey" FOREIGN KEY ("scoringRubricId") REFERENCES "ScoringRubric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRevision" ADD CONSTRAINT "ContentRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentRevision" ADD CONSTRAINT "ContentRevision_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "GeneratedContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoringRubric" ADD CONSTRAINT "ScoringRubric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishRecord" ADD CONSTRAINT "PublishRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishRecord" ADD CONSTRAINT "PublishRecord_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "GeneratedContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishRecord" ADD CONSTRAINT "PublishRecord_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ContentRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_publishRecordId_fkey" FOREIGN KEY ("publishRecordId") REFERENCES "PublishRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retrospective" ADD CONSTRAINT "Retrospective_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retrospective" ADD CONSTRAINT "Retrospective_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "GeneratedContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retrospective" ADD CONSTRAINT "Retrospective_publishRecordId_fkey" FOREIGN KEY ("publishRecordId") REFERENCES "PublishRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retrospective" ADD CONSTRAINT "Retrospective_scoringRubricId_fkey" FOREIGN KEY ("scoringRubricId") REFERENCES "ScoringRubric"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FetchLog" ADD CONSTRAINT "FetchLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCallLog" ADD CONSTRAINT "AiCallLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
