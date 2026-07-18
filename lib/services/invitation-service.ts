import { createHash, randomBytes } from "node:crypto";
import { InvitationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

const CLAIM_TTL_MS = 24 * 60 * 60 * 1000;

export function normalizeInvitationCode(value: string) {
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

export function hashInvitationCode(value: string) {
  return createHash("sha256")
    .update(normalizeInvitationCode(value))
    .digest("hex");
}

export function generateInvitationCode() {
  const body = randomBytes(10).toString("hex").toUpperCase();
  return `STAR-${body.match(/.{1,5}/g)?.join("-") ?? body}`;
}

export async function createInvitationCode(input: {
  label: string;
  maxUses: number;
  validDays: number;
  createdBy?: string;
}) {
  const label = input.label.trim();
  if (!label || label.length > 100) {
    throw new AppError("VALIDATION_ERROR", "邀请码名称不能为空且不能超过 100 个字符。", 400);
  }
  if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 1000) {
    throw new AppError("VALIDATION_ERROR", "邀请码名额必须是 1 到 1000 之间的整数。", 400);
  }
  if (!Number.isFinite(input.validDays) || input.validDays <= 0 || input.validDays > 365) {
    throw new AppError("VALIDATION_ERROR", "邀请码有效天数必须大于 0 且不超过 365。", 400);
  }

  const code = generateInvitationCode();
  const tokenHash = hashInvitationCode(code);
  const inviteCode = await prisma.invitationCode.create({
    data: {
      label,
      tokenHash,
      codeHint: code.slice(-5),
      maxUses: input.maxUses,
      expiresAt: new Date(Date.now() + input.validDays * 24 * 60 * 60 * 1000),
      createdBy: input.createdBy,
    },
  });
  return { code, inviteCode };
}

/**
 * Turn a shared beta code into the existing email-bound invitation used by Auth.js.
 * A transaction-scoped advisory lock serializes claims for one code, so concurrent
 * requests cannot reserve more active registrations than maxUses.
 */
export async function ensureInvitationForEmail(emailValue: string, codeValue?: string) {
  const email = emailValue.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new AppError("VALIDATION_ERROR", "请输入有效邮箱。", 400);
  }

  const existing = await prisma.invitation.findUnique({ where: { email } });
  if (existing && isUsableInvitation(existing)) return existing;

  const normalizedCode = normalizeInvitationCode(codeValue ?? "");
  if (!normalizedCode) {
    throw new AppError("FORBIDDEN", "需要有效的邀请码。", 403);
  }
  const tokenHash = hashInvitationCode(normalizedCode);

  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw<Array<{ locked: number }>>(
      Prisma.sql`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${tokenHash}))) AS acquired`,
    );

    const now = new Date();
    const inviteCode = await transaction.invitationCode.findUnique({
      where: { tokenHash },
    });
    if (!inviteCode || inviteCode.revokedAt || inviteCode.expiresAt <= now) {
      throw new AppError("FORBIDDEN", "邀请码无效或已过期。", 403);
    }

    const currentInvitation = await transaction.invitation.findUnique({
      where: { email },
    });
    if (currentInvitation && isUsableInvitation(currentInvitation, now)) return currentInvitation;

    const activeClaims = await transaction.invitation.count({
      where: {
        inviteCodeId: inviteCode.id,
        OR: [
          { status: InvitationStatus.accepted },
          { status: InvitationStatus.pending, expiresAt: { gt: now } },
        ],
      },
    });
    if (activeClaims >= inviteCode.maxUses) {
      throw new AppError("CONFLICT", "邀请码名额已用完。", 409);
    }

    const invitationTokenHash = createHash("sha256")
      .update(`${tokenHash}:${email}:${randomBytes(16).toString("hex")}`)
      .digest("hex");
    const data = {
      inviteCodeId: inviteCode.id,
      tokenHash: invitationTokenHash,
      status: InvitationStatus.pending,
      expiresAt: new Date(now.getTime() + CLAIM_TTL_MS),
      acceptedAt: null,
      acceptedByUserId: null,
      createdBy: `code:${inviteCode.codeHint}`,
    };

    return currentInvitation
      ? transaction.invitation.update({ where: { id: currentInvitation.id }, data })
      : transaction.invitation.create({ data: { email, ...data } });
  });
}

export async function listInvitationCodeUsage() {
  const codes = await prisma.invitationCode.findMany({
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(
    codes.map(async (code) => {
      const now = new Date();
      const [accepted, reserved] = await Promise.all([
        prisma.invitation.count({
          where: { inviteCodeId: code.id, status: InvitationStatus.accepted },
        }),
        prisma.invitation.count({
          where: {
            inviteCodeId: code.id,
            status: InvitationStatus.pending,
            expiresAt: { gt: now },
          },
        }),
      ]);
      return { ...code, accepted, reserved, available: Math.max(0, code.maxUses - accepted - reserved) };
    }),
  );
}

function isUsableInvitation(
  invitation: { status: InvitationStatus; expiresAt: Date } | null,
  now = new Date(),
) {
  if (!invitation || invitation.status === InvitationStatus.revoked) return false;
  if (invitation.status === InvitationStatus.accepted) return true;
  return invitation.status === InvitationStatus.pending && invitation.expiresAt > now;
}
