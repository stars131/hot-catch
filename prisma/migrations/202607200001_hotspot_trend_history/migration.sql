-- CreateTable
CREATE TABLE "HotspotTrendTopic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT,
    "primaryPlatform" TEXT NOT NULL,
    "currentRank" INTEGER NOT NULL,
    "currentHeat" DOUBLE PRECISION NOT NULL,
    "sourceCount" INTEGER NOT NULL,
    "firstObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastObservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotspotTrendTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotspotTrendObservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hotspotTrendTopicId" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "heat" DOUBLE PRECISION NOT NULL,
    "topicRank" INTEGER NOT NULL,
    "sourceCount" INTEGER NOT NULL,
    "backendCount" INTEGER NOT NULL,
    "bestSourceRank" INTEGER,
    "evidence" JSONB,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotspotTrendObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HotspotTrendTopic_userId_topicKey_key" ON "HotspotTrendTopic"("userId", "topicKey");

-- CreateIndex
CREATE INDEX "HotspotTrendTopic_userId_lastObservedAt_idx" ON "HotspotTrendTopic"("userId", "lastObservedAt");

-- CreateIndex
CREATE UNIQUE INDEX "HotspotTrendObservation_hotspotTrendTopicId_bucketKey_key" ON "HotspotTrendObservation"("hotspotTrendTopicId", "bucketKey");

-- CreateIndex
CREATE INDEX "HotspotTrendObservation_userId_observedAt_idx" ON "HotspotTrendObservation"("userId", "observedAt");

-- CreateIndex
CREATE INDEX "HotspotTrendObservation_userId_hotspotTrendTopicId_observedAt_idx" ON "HotspotTrendObservation"("userId", "hotspotTrendTopicId", "observedAt");

-- AddForeignKey
ALTER TABLE "HotspotTrendTopic" ADD CONSTRAINT "HotspotTrendTopic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotspotTrendObservation" ADD CONSTRAINT "HotspotTrendObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HotspotTrendObservation" ADD CONSTRAINT "HotspotTrendObservation_hotspotTrendTopicId_fkey" FOREIGN KEY ("hotspotTrendTopicId") REFERENCES "HotspotTrendTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
