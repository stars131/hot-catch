-- X read-only API credential for region, topic, and account discovery.
ALTER TYPE "CredentialProvider" ADD VALUE 'x_api';

-- Multi-use beta codes store only a hash; the plaintext is shown once by the CLI.
CREATE TABLE "InvitationCode" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeHint" TEXT NOT NULL,
    "maxUses" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvitationCode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvitationCode_maxUses_check" CHECK ("maxUses" > 0)
);

ALTER TABLE "Invitation" ADD COLUMN "inviteCodeId" TEXT;

CREATE UNIQUE INDEX "InvitationCode_tokenHash_key" ON "InvitationCode"("tokenHash");
CREATE INDEX "InvitationCode_expiresAt_revokedAt_idx" ON "InvitationCode"("expiresAt", "revokedAt");
CREATE INDEX "Invitation_inviteCodeId_status_expiresAt_idx" ON "Invitation"("inviteCodeId", "status", "expiresAt");

ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_inviteCodeId_fkey"
FOREIGN KEY ("inviteCodeId") REFERENCES "InvitationCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
