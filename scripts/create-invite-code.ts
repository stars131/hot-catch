import { prisma } from "@/lib/prisma";
import { createInvitationCode } from "@/lib/services/invitation-service";

async function main() {
  const label = process.argv[2]?.trim();
  const maxUses = Number(process.argv[3]);
  const validDays = Number(process.argv[4] ?? 14);
  if (!label || !Number.isInteger(maxUses)) {
    throw new Error(
      'Usage: npm run invite:code:create -- "beta-wave-1" <maxUsers> [validDays]',
    );
  }

  const { code, inviteCode } = await createInvitationCode({
    label,
    maxUses,
    validDays,
    createdBy: "cli",
  });
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  process.stdout.write(
    [
      `Invite code (shown once): ${code}`,
      `Capacity: ${inviteCode.maxUses}`,
      `Expires: ${inviteCode.expiresAt.toISOString()}`,
      `Sign-up URL: ${baseUrl}/signin?invite=${encodeURIComponent(code)}`,
    ].join("\n") + "\n",
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Invite code creation failed"}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
