import { afterAll, describe, expect, it } from "vitest";
import { InvitationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createInvitationCode,
  ensureInvitationForEmail,
} from "@/lib/services/invitation-service";

const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const createdCodeIds: string[] = [];
const createdEmails: string[] = [];

afterAll(async () => {
  await prisma.invitation.deleteMany({ where: { email: { in: createdEmails } } });
  await prisma.invitationCode.deleteMany({ where: { id: { in: createdCodeIds } } });
  await prisma.$disconnect();
});

describe("limited shared invitation codes", () => {
  it("does not exceed capacity under concurrent claims", async () => {
    const { code, inviteCode } = await createInvitationCode({
      label: `concurrency-${runId}`,
      maxUses: 2,
      validDays: 1,
      createdBy: "integration-test",
    });
    createdCodeIds.push(inviteCode.id);
    const emails = [0, 1, 2].map((index) => `invite-concurrent-${runId}-${index}@example.com`);
    createdEmails.push(...emails);

    const results = await Promise.allSettled(
      emails.map((email) => ensureInvitationForEmail(email, code)),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.invitation.count({ where: { inviteCodeId: inviteCode.id } })).toBe(2);
  });

  it("releases an expired reservation for the next registrant", async () => {
    const { code, inviteCode } = await createInvitationCode({
      label: `release-${runId}`,
      maxUses: 1,
      validDays: 1,
    });
    createdCodeIds.push(inviteCode.id);
    const firstEmail = `invite-release-a-${runId}@example.com`;
    const secondEmail = `invite-release-b-${runId}@example.com`;
    createdEmails.push(firstEmail, secondEmail);

    const first = await ensureInvitationForEmail(firstEmail, code);
    await prisma.invitation.update({
      where: { id: first.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const second = await ensureInvitationForEmail(secondEmail, code);
    expect(second.email).toBe(secondEmail);
  });

  it("keeps an accepted email eligible after its original invitation expires", async () => {
    const email = `invite-accepted-${runId}@example.com`;
    createdEmails.push(email);
    const invitation = await prisma.invitation.create({
      data: {
        email,
        tokenHash: `accepted-${runId}`,
        status: InvitationStatus.accepted,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        acceptedAt: new Date(),
      },
    });

    await expect(ensureInvitationForEmail(email)).resolves.toMatchObject({ id: invitation.id });
  });
});
