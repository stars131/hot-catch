import { prisma } from "@/lib/prisma";
import { listInvitationCodeUsage } from "@/lib/services/invitation-service";

async function main() {
  const rows = await listInvitationCodeUsage();
  if (!rows.length) {
    process.stdout.write("No shared invite codes.\n");
    return;
  }
  for (const row of rows) {
    const status = row.revokedAt
      ? "revoked"
      : row.expiresAt <= new Date()
        ? "expired"
        : "active";
    process.stdout.write(
      `${row.label} [••••${row.codeHint}] ${status} accepted=${row.accepted} reserved=${row.reserved} available=${row.available}/${row.maxUses} expires=${row.expiresAt.toISOString()}\n`,
    );
  }
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Invite code listing failed"}\n`);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
