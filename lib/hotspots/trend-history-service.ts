import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  HotspotPayload,
  HotspotTopic,
} from "@/lib/hotspots/hotspot-service";
import {
  buildHotspotTrendWindows,
  selectHotspotTrendWindow,
  type HotspotObservationPoint,
} from "@/lib/hotspots/trend-evidence";

const OBSERVATION_BUCKET_MS = 30 * 60 * 1_000;
const RETENTION_MS = 8 * 24 * 60 * 60 * 1_000;

type TopicSnapshot = {
  topic: HotspotTopic;
  topicRank: number;
  sourceCount: number;
  backendCount: number;
  bestSourceRank: number | null;
};

export async function enrichHotspotPayloadWithHistory(
  userId: string,
  payload: HotspotPayload,
  options?: { record?: boolean; now?: Date },
): Promise<HotspotPayload> {
  const now = options?.now ?? new Date();
  const snapshots = payload.topics.map(toTopicSnapshot);
  if (!snapshots.length) return payload;

  if (options?.record !== false) {
    await recordSnapshots(userId, snapshots, now);
  }

  const topicKeys = snapshots.map(({ topic }) => topic.id);
  const retentionStart = new Date(now.getTime() - RETENTION_MS);
  const storedTopics = await prisma.hotspotTrendTopic.findMany({
    where: { userId, topicKey: { in: topicKeys } },
    include: {
      observations: {
        where: { userId, observedAt: { gte: retentionStart } },
        orderBy: { observedAt: "asc" },
      },
    },
  });
  const storedByKey = new Map(storedTopics.map((topic) => [topic.topicKey, topic]));

  return {
    ...payload,
    topics: snapshots.map((snapshot) => {
      const stored = storedByKey.get(snapshot.topic.id);
      const points = withCurrentPoint(
        stored?.observations.map((observation) => ({
          observedAt: observation.observedAt,
          heat: observation.heat,
          topicRank: observation.topicRank,
          sourceCount: observation.sourceCount,
        })) ?? [],
        snapshot,
        now,
      );
      const trendWindows = buildHotspotTrendWindows({
        firstObservedAt: stored?.firstObservedAt ?? now,
        points,
        now,
      });
      return selectHotspotTrendWindow(
        { ...snapshot.topic, trendWindows, trendEvidence: trendWindows["24h"] },
        "24h",
      );
    }),
  };
}

async function recordSnapshots(
  userId: string,
  snapshots: TopicSnapshot[],
  now: Date,
) {
  const storedTopics = await prisma.$transaction(
    snapshots.map((snapshot) => prisma.hotspotTrendTopic.upsert({
      where: {
        userId_topicKey: { userId, topicKey: snapshot.topic.id },
      },
      update: {
        title: snapshot.topic.title,
        category: snapshot.topic.category,
        primaryPlatform: snapshot.topic.platform,
        currentRank: snapshot.topicRank,
        currentHeat: snapshot.topic.heat,
        sourceCount: snapshot.sourceCount,
        lastObservedAt: now,
      },
      create: {
        userId,
        topicKey: snapshot.topic.id,
        title: snapshot.topic.title,
        category: snapshot.topic.category,
        primaryPlatform: snapshot.topic.platform,
        currentRank: snapshot.topicRank,
        currentHeat: snapshot.topic.heat,
        sourceCount: snapshot.sourceCount,
        firstObservedAt: now,
        lastObservedAt: now,
      },
    })),
  );
  const storedByKey = new Map(storedTopics.map((topic) => [topic.topicKey, topic]));
  const bucketKey = toBucketKey(now);

  await prisma.$transaction([
    ...snapshots.map((snapshot) => {
      const stored = storedByKey.get(snapshot.topic.id);
      if (!stored) throw new Error(`热点趋势主题写入失败：${snapshot.topic.id}`);
      const data = {
        userId,
        heat: snapshot.topic.heat,
        topicRank: snapshot.topicRank,
        sourceCount: snapshot.sourceCount,
        backendCount: snapshot.backendCount,
        bestSourceRank: snapshot.bestSourceRank,
        evidence: toEvidence(snapshot.topic),
        observedAt: now,
      };
      return prisma.hotspotTrendObservation.upsert({
        where: {
          hotspotTrendTopicId_bucketKey: {
            hotspotTrendTopicId: stored.id,
            bucketKey,
          },
        },
        update: data,
        create: {
          ...data,
          hotspotTrendTopicId: stored.id,
          bucketKey,
        },
      });
    }),
    prisma.hotspotTrendObservation.deleteMany({
      where: {
        userId,
        observedAt: { lt: new Date(now.getTime() - RETENTION_MS) },
      },
    }),
  ]);
}

function toTopicSnapshot(topic: HotspotTopic, index: number): TopicSnapshot {
  const platformCodes = new Set(topic.sources.map((source) => source.platformCode));
  const backends = new Set(topic.sources.map((source) => source.backend));
  const ranks = topic.sources
    .map((source) => source.rank)
    .filter((rank) => Number.isFinite(rank));
  return {
    topic,
    topicRank: index + 1,
    sourceCount: platformCodes.size,
    backendCount: backends.size,
    bestSourceRank: ranks.length ? Math.min(...ranks) : null,
  };
}

function withCurrentPoint(
  points: HotspotObservationPoint[],
  snapshot: TopicSnapshot,
  now: Date,
) {
  const current: HotspotObservationPoint = {
    observedAt: now,
    heat: snapshot.topic.heat,
    topicRank: snapshot.topicRank,
    sourceCount: snapshot.sourceCount,
  };
  const currentBucket = toBucketKey(now);
  const withoutCurrentBucket = points.filter(
    (point) => toBucketKey(point.observedAt) !== currentBucket,
  );
  return [...withoutCurrentBucket, current];
}

function toBucketKey(date: Date) {
  const bucket = Math.floor(date.getTime() / OBSERVATION_BUCKET_MS) * OBSERVATION_BUCKET_MS;
  return new Date(bucket).toISOString();
}

function toEvidence(topic: HotspotTopic): Prisma.InputJsonValue {
  return {
    keywords: topic.keywords,
    sources: topic.sources.slice(0, 8).map((source) => ({
      platformCode: source.platformCode,
      rank: source.rank,
      backend: source.backend,
      url: source.url,
    })),
  };
}
