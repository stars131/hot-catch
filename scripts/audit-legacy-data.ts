import { prisma } from "@/lib/prisma";

async function main() {
  const duplicateAccounts = await prisma.$queryRawUnsafe(
    'SELECT "userId", "xhsId", COUNT(*)::int AS count FROM "BenchmarkAccount" WHERE "xhsId" IS NOT NULL GROUP BY "userId", "xhsId" HAVING COUNT(*) > 1',
  );
  const duplicateNotes = await prisma.$queryRawUnsafe(
    'SELECT "accountId", "noteId", COUNT(*)::int AS count FROM "BenchmarkNote" WHERE "noteId" IS NOT NULL GROUP BY "accountId", "noteId" HAVING COUNT(*) > 1',
  );
  const totals = await prisma.$queryRawUnsafe(
    'SELECT (SELECT COUNT(*)::int FROM "User") AS users, (SELECT COUNT(*)::int FROM "BenchmarkAccount") AS accounts, (SELECT COUNT(*)::int FROM "BenchmarkNote") AS notes',
  );
  process.stdout.write(
    `${JSON.stringify({ totals, duplicateAccounts, duplicateNotes }, null, 2)}\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Audit failed"}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
