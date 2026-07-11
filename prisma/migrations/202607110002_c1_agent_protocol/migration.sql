-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('pending', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('pending', 'running', 'waiting_input', 'completed', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "ContentReferenceRole" AS ENUM ('inspiration', 'facts', 'structure', 'style');

-- AlterTable
ALTER TABLE "ProcessingJob" ADD COLUMN     "action" TEXT,
ADD COLUMN     "agentRunId" TEXT,
ADD COLUMN     "parentJobId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "clientMessageId" TEXT,
ADD COLUMN     "protocolVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "status" "MessageStatus" NOT NULL DEFAULT 'complete';

-- AlterTable
ALTER TABLE "ContentRevision" ADD COLUMN     "originJobId" TEXT,
ADD COLUMN     "provenance" JSONB;

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "requestMessageId" TEXT,
    "assistantMessageId" TEXT,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'pending',
    "command" TEXT,
    "input" JSONB,
    "output" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentReference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "benchmarkAccountId" TEXT,
    "benchmarkNoteId" TEXT,
    "ideaId" TEXT,
    "role" "ContentReferenceRole" NOT NULL DEFAULT 'inspiration',
    "sourceUrl" TEXT,
    "fingerprint" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_userId_status_createdAt_idx" ON "AgentRun"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_conversationId_idx" ON "AgentRun"("conversationId");

-- CreateIndex
CREATE INDEX "ContentReference_userId_contentId_idx" ON "ContentReference"("userId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentReference_contentId_fingerprint_role_key" ON "ContentReference"("contentId", "fingerprint", "role");

-- CreateIndex
CREATE INDEX "ProcessingJob_agentRunId_idx" ON "ProcessingJob"("agentRunId");

-- CreateIndex
CREATE INDEX "ProcessingJob_parentJobId_idx" ON "ProcessingJob"("parentJobId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_clientMessageId_key" ON "Message"("conversationId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentRevision_originJobId_key" ON "ContentRevision"("originJobId");

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessingJob" ADD CONSTRAINT "ProcessingJob_parentJobId_fkey" FOREIGN KEY ("parentJobId") REFERENCES "ProcessingJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReference" ADD CONSTRAINT "ContentReference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReference" ADD CONSTRAINT "ContentReference_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "GeneratedContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

