CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "SocialConnectionSource" AS ENUM ('authorized', 'manual');

-- CreateEnum
CREATE TYPE "PersonaStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "PersonaSource" AS ENUM ('manual', 'imported', 'memory_assisted');

-- CreateEnum
CREATE TYPE "InteractionKind" AS ENUM ('approval', 'input');

-- CreateEnum
CREATE TYPE "InteractionStatus" AS ENUM ('pending', 'resolved', 'expired', 'canceled');

-- CreateEnum
CREATE TYPE "QueuePolicy" AS ENUM ('append', 'interrupt');

-- CreateEnum
CREATE TYPE "QueueStatus" AS ENUM ('queued', 'running', 'completed', 'canceled', 'failed');

-- CreateEnum
CREATE TYPE "MemoryScope" AS ENUM ('global', 'account');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('expression', 'audience', 'boundary', 'workflow', 'feedback', 'reference', 'preference');

-- CreateEnum
CREATE TYPE "MemoryStatus" AS ENUM ('candidate', 'approved', 'rejected', 'archived');

-- CreateEnum
CREATE TYPE "ScheduledWorkflowType" AS ENUM ('hotspot_refresh', 'research_digest', 'draft_generation', 'metrics_collection', 'retrospective_prepare');

-- CreateEnum
CREATE TYPE "ScheduledWorkflowStatus" AS ENUM ('active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'canceled');

-- AlterTable
ALTER TABLE "AgentRun" ADD COLUMN     "contextVersionId" TEXT;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "activeContextVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "baseMessageId" TEXT,
ADD COLUMN     "lastEventSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "parentConversationId" TEXT,
ADD COLUMN     "streamEpoch" TEXT;

UPDATE "Conversation"
SET "streamEpoch" = md5(random()::text || clock_timestamp()::text || "id")
WHERE "streamEpoch" IS NULL;

ALTER TABLE "Conversation" ALTER COLUMN "streamEpoch" SET NOT NULL;

-- AlterTable
ALTER TABLE "GeneratedContent" ADD COLUMN     "contextSnapshot" JSONB,
ADD COLUMN     "targetSocialConnectionId" TEXT;

-- AlterTable
ALTER TABLE "Persona" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "previousVersionId" TEXT,
ADD COLUMN     "socialConnectionId" TEXT,
ADD COLUMN     "source" "PersonaSource" NOT NULL DEFAULT 'manual',
ADD COLUMN     "status" "PersonaStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "Persona"
SET "status" = 'active', "source" = 'manual', "version" = 1,
    "activatedAt" = COALESCE("activatedAt", "updatedAt")
WHERE "socialConnectionId" IS NULL;

-- AlterTable
ALTER TABLE "SocialConnection" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "source" "SocialConnectionSource" NOT NULL DEFAULT 'authorized';

-- CreateTable
CREATE TABLE "ConversationContextVersion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "accountBindings" JSONB,
    "personaSnapshot" JSONB,
    "memorySnapshot" JSONB,
    "modelProvider" TEXT,
    "modelName" TEXT,
    "modelContextWindow" INTEGER,
    "contentLocale" TEXT NOT NULL DEFAULT 'zh-CN',
    "targetPlatforms" "Platform"[] DEFAULT ARRAY[]::"Platform"[],
    "skillSnapshots" JSONB,
    "referenceSnapshot" JSONB,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationContextVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "streamEpoch" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "runId" TEXT,
    "messageId" TEXT,
    "retainedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "agentRunId" TEXT,
    "messageId" TEXT,
    "kind" "InteractionKind" NOT NULL,
    "status" "InteractionStatus" NOT NULL DEFAULT 'pending',
    "actionKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "resolution" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueuedTurn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "clientTurnId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "QueueStatus" NOT NULL DEFAULT 'queued',
    "policy" "QueuePolicy" NOT NULL DEFAULT 'append',
    "content" TEXT NOT NULL,
    "parts" JSONB,
    "context" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueuedTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSegment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "startMessageId" TEXT NOT NULL,
    "endMessageId" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "tokenEstimate" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "ledger" JSONB NOT NULL,
    "checkpoint" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "socialConnectionId" TEXT,
    "scope" "MemoryScope" NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "status" "MemoryStatus" NOT NULL DEFAULT 'candidate',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceExcerpt" TEXT,
    "conflictWithIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supersedesId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledWorkflow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "socialConnectionId" TEXT,
    "type" "ScheduledWorkflowType" NOT NULL,
    "status" "ScheduledWorkflowStatus" NOT NULL DEFAULT 'active',
    "name" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "maxRuns" INTEGER,
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledWorkflowId" TEXT NOT NULL,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'queued',
    "idempotencyKey" TEXT NOT NULL,
    "processingJobId" TEXT,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationContextVersion_userId_createdAt_idx" ON "ConversationContextVersion"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationContextVersion_conversationId_version_key" ON "ConversationContextVersion"("conversationId", "version");

-- CreateIndex
CREATE INDEX "ConversationEvent_userId_createdAt_idx" ON "ConversationEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationEvent_retainedUntil_idx" ON "ConversationEvent"("retainedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationEvent_conversationId_seq_key" ON "ConversationEvent"("conversationId", "seq");

-- CreateIndex
CREATE INDEX "PendingInteraction_userId_status_expiresAt_idx" ON "PendingInteraction"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "PendingInteraction_conversationId_status_idx" ON "PendingInteraction"("conversationId", "status");

-- CreateIndex
CREATE INDEX "QueuedTurn_conversationId_status_position_idx" ON "QueuedTurn"("conversationId", "status", "position");

-- CreateIndex
CREATE INDEX "QueuedTurn_userId_status_updatedAt_idx" ON "QueuedTurn"("userId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "QueuedTurn_conversationId_clientTurnId_key" ON "QueuedTurn"("conversationId", "clientTurnId");

-- CreateIndex
CREATE INDEX "ConversationSegment_userId_createdAt_idx" ON "ConversationSegment"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSegment_conversationId_startMessageId_endMessag_key" ON "ConversationSegment"("conversationId", "startMessageId", "endMessageId");

-- CreateIndex
CREATE INDEX "AccountMemory_userId_scope_status_updatedAt_idx" ON "AccountMemory"("userId", "scope", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "AccountMemory_socialConnectionId_status_updatedAt_idx" ON "AccountMemory"("socialConnectionId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "MemoryAudit_memoryId_createdAt_idx" ON "MemoryAudit"("memoryId", "createdAt");

-- CreateIndex
CREATE INDEX "MemoryAudit_userId_createdAt_idx" ON "MemoryAudit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduledWorkflow_userId_status_nextRunAt_idx" ON "ScheduledWorkflow"("userId", "status", "nextRunAt");

-- CreateIndex
CREATE INDEX "ScheduledWorkflow_socialConnectionId_idx" ON "ScheduledWorkflow"("socialConnectionId");

-- CreateIndex
CREATE INDEX "WorkflowRun_userId_status_createdAt_idx" ON "WorkflowRun"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_scheduledWorkflowId_idempotencyKey_key" ON "WorkflowRun"("scheduledWorkflowId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "AgentRun_contextVersionId_idx" ON "AgentRun"("contextVersionId");

-- CreateIndex
CREATE INDEX "Conversation_userId_updatedAt_idx" ON "Conversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_parentConversationId_idx" ON "Conversation"("parentConversationId");

-- CreateIndex
CREATE INDEX "GeneratedContent_targetSocialConnectionId_idx" ON "GeneratedContent"("targetSocialConnectionId");

-- CreateIndex
CREATE INDEX "Persona_userId_status_updatedAt_idx" ON "Persona"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Persona_socialConnectionId_status_idx" ON "Persona"("socialConnectionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_socialConnectionId_version_key" ON "Persona"("socialConnectionId", "version");

CREATE UNIQUE INDEX "Persona_one_active_per_account_key"
ON "Persona"("socialConnectionId")
WHERE "socialConnectionId" IS NOT NULL AND "status" = 'active';

CREATE UNIQUE INDEX "SocialConnection_one_default_per_platform_key"
ON "SocialConnection"("userId", "platform")
WHERE "isDefault" = true AND "archivedAt" IS NULL;

CREATE INDEX "Conversation_title_trgm_idx" ON "Conversation" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "Message_content_trgm_idx" ON "Message" USING GIN ("content" gin_trgm_ops);
CREATE INDEX "GeneratedContent_title_trgm_idx" ON "GeneratedContent" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "AccountMemory_body_trgm_idx" ON "AccountMemory" USING GIN ("body" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "SocialConnection_userId_platform_isDefault_idx" ON "SocialConnection"("userId", "platform", "isDefault");

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_socialConnectionId_fkey" FOREIGN KEY ("socialConnectionId") REFERENCES "SocialConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "Persona"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_parentConversationId_fkey" FOREIGN KEY ("parentConversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedContent" ADD CONSTRAINT "GeneratedContent_targetSocialConnectionId_fkey" FOREIGN KEY ("targetSocialConnectionId") REFERENCES "SocialConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_contextVersionId_fkey" FOREIGN KEY ("contextVersionId") REFERENCES "ConversationContextVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationContextVersion" ADD CONSTRAINT "ConversationContextVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationContextVersion" ADD CONSTRAINT "ConversationContextVersion_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationEvent" ADD CONSTRAINT "ConversationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationEvent" ADD CONSTRAINT "ConversationEvent_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingInteraction" ADD CONSTRAINT "PendingInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PendingInteraction" ADD CONSTRAINT "PendingInteraction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueuedTurn" ADD CONSTRAINT "QueuedTurn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueuedTurn" ADD CONSTRAINT "QueuedTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSegment" ADD CONSTRAINT "ConversationSegment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSegment" ADD CONSTRAINT "ConversationSegment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMemory" ADD CONSTRAINT "AccountMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMemory" ADD CONSTRAINT "AccountMemory_socialConnectionId_fkey" FOREIGN KEY ("socialConnectionId") REFERENCES "SocialConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMemory" ADD CONSTRAINT "AccountMemory_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "AccountMemory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryAudit" ADD CONSTRAINT "MemoryAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryAudit" ADD CONSTRAINT "MemoryAudit_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "AccountMemory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledWorkflow" ADD CONSTRAINT "ScheduledWorkflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledWorkflow" ADD CONSTRAINT "ScheduledWorkflow_socialConnectionId_fkey" FOREIGN KEY ("socialConnectionId") REFERENCES "SocialConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_scheduledWorkflowId_fkey" FOREIGN KEY ("scheduledWorkflowId") REFERENCES "ScheduledWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
