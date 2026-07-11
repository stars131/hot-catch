import { prisma } from "@/lib/prisma";
import { checkRedisConnection } from "@/lib/jobs/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function checkDatabase() {
  await prisma.$queryRaw`SELECT 1`;
  return "ok" as const;
}

export async function GET() {
  const startedAt = Date.now();
  const [database, redis] = await Promise.allSettled([
    checkDatabase(),
    checkRedisConnection(),
  ]);
  const dependencies = {
    database: database.status === "fulfilled" ? "ok" : "unavailable",
    redis: redis.status === "fulfilled" ? "ok" : "unavailable",
  } as const;
  const ready = Object.values(dependencies).every((status) => status === "ok");

  return Response.json(
    {
      status: ready ? "ready" : "degraded",
      dependencies,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
    },
    { status: ready ? 200 : 503 },
  );
}
