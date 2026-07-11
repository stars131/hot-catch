import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CredentialProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  listCredentialSummaries,
  loadCredential,
  saveCredential,
} from "@/lib/services/credential-service";
import { listAccounts } from "@/lib/services/benchmark-service";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let userAId = "";
let userBId = "";

beforeAll(async () => {
  const [userA, userB] = await Promise.all([
    prisma.user.create({ data: { email: `isolation-a-${runId}@example.com` } }),
    prisma.user.create({ data: { email: `isolation-b-${runId}@example.com` } }),
  ]);
  userAId = userA.id;
  userBId = userB.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.$disconnect();
});

describe("cross-user isolation", () => {
  it("does not expose benchmark accounts owned by another user", async () => {
    const account = await prisma.benchmarkAccount.create({
      data: {
        userId: userAId,
        platform: "xiaohongshu",
        platformAccountId: `account-${runId}`,
        xhsId: `account-${runId}`,
        nickname: "A 的账号",
      },
    });

    const visibleToA = await listAccounts(userAId);
    const visibleToB = await listAccounts(userBId);
    expect(visibleToA.some((item) => item.id === account.id)).toBe(true);
    expect(visibleToB.some((item) => item.id === account.id)).toBe(false);
  });

  it("never returns or decrypts another user's provider credential", async () => {
    await saveCredential(userAId, CredentialProvider.tikhub, {
      apiKey: `secret-${runId}`,
    });

    const summaries = await listCredentialSummaries(userBId);
    expect(
      summaries.find((item) => item.provider === CredentialProvider.tikhub),
    ).toMatchObject({ configured: false, status: "missing" });
    await expect(
      loadCredential(userBId, CredentialProvider.tikhub),
    ).rejects.toMatchObject({ code: "CREDENTIAL_NOT_CONFIGURED" });
  });
});
