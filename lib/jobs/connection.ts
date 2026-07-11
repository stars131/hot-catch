import IORedis from "ioredis";
import { env } from "@/lib/env";

const globalForRedis = globalThis as unknown as {
  startraceRedis?: IORedis;
};

export function getRedisConnection() {
  const existing = globalForRedis.startraceRedis;
  if (existing && existing.status !== "end") return existing;

  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  if (env.NODE_ENV !== "production") {
    globalForRedis.startraceRedis = connection;
  }
  return connection;
}

export async function checkRedisConnection() {
  const connection = getRedisConnection();
  if (connection.status === "wait") await connection.connect();
  return connection.ping();
}
