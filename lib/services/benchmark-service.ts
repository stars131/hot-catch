import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export async function listAccounts(userId: string) {
  return prisma.benchmarkAccount.findMany({
    where: { userId, isArchived: false },
    include: {
      _count: { select: { notes: true } },
      notes: {
        orderBy: { updatedAt: "desc" },
        take: 3,
      },
    },
    orderBy: [{ isFavorite: "desc" }, { updatedAt: "desc" }],
  });
}

export async function getAccount(userId: string, accountId: string) {
  return prisma.benchmarkAccount.findFirst({
    where: { id: accountId, userId, isArchived: false },
    include: {
      notes: { orderBy: { updatedAt: "desc" } },
      analyses: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
}

export async function getAccountsWithNotes(userId: string, accountIds: string[]) {
  if (!accountIds.length) return [];
  return prisma.benchmarkAccount.findMany({
    where: { id: { in: accountIds }, userId, isArchived: false },
    include: { notes: { orderBy: { updatedAt: "desc" }, take: 10 } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function updateAccountMeta(
  userId: string,
  accountId: string,
  data: {
    userRemark?: string;
    isFavorite?: boolean;
    groupName?: string;
  }
) {
  const account = await prisma.benchmarkAccount.findFirst({
    where: { id: accountId, userId, isArchived: false },
  });
  if (!account) throw new AppError("NOT_FOUND", "Benchmark account not found.", 404);

  return prisma.benchmarkAccount.update({
    where: { id: accountId },
    data,
  });
}

export async function deleteAccount(userId: string, accountId: string) {
  const account = await prisma.benchmarkAccount.findFirst({
    where: { id: accountId, userId, isArchived: false },
  });
  if (!account) throw new AppError("NOT_FOUND", "Benchmark account not found.", 404);

  await prisma.benchmarkAccount.update({
    where: { id: accountId },
    data: { isArchived: true },
  });
}
