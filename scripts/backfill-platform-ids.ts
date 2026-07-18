import { prisma } from "@/lib/prisma";

async function main() {
  const accountCount = await prisma.$executeRaw`
    UPDATE "BenchmarkAccount"
    SET "platformAccountId" = "xhsId"
    WHERE "platform" = 'xiaohongshu'
      AND "platformAccountId" IS NULL
      AND "xhsId" IS NOT NULL
  `;
  const noteCount = await prisma.$executeRaw`
    UPDATE "BenchmarkNote"
    SET "platformContentId" = "noteId"
    WHERE "platformContentId" IS NULL
      AND "noteId" IS NOT NULL
  `;

  process.stdout.write(
    `Backfilled ${accountCount} account ids and ${noteCount} content ids.\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Backfill failed"}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
