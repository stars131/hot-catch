import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  const validDays = Number(process.argv[3] ?? 14);
  if (!email || !email.includes("@") || !Number.isFinite(validDays) || validDays <= 0) {
    throw new Error("Usage: npm run invite:create -- creator@example.com [validDays]");
  }
  const token = randomBytes(24).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);
  const invitation = await prisma.invitation.upsert({
    where: { email },
    update: { tokenHash, status: "pending", expiresAt, acceptedAt: null, acceptedByUserId: null },
    create: { email, tokenHash, expiresAt, createdBy: "cli" },
  });
  process.stdout.write(
    `Invitation ready for ${invitation.email}; expires ${invitation.expiresAt.toISOString()}.\n`,
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Invitation failed"}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
