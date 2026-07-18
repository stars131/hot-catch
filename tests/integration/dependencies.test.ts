import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkRedisConnection, getRedisConnection } from "@/lib/jobs/connection";

afterAll(async () => {
  await prisma.$disconnect();
  await getRedisConnection().quit();
});

describe("required infrastructure", () => {
  it("can query PostgreSQL", async () => {
    const result = await prisma.$queryRaw<Array<{ value: number }>>`SELECT 1 AS value`;
    expect(result[0]?.value).toBe(1);
  });

  it("can ping Redis", async () => {
    await expect(checkRedisConnection()).resolves.toBe("PONG");
  });
});
