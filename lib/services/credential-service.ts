import { CredentialProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  credentialHint,
  decryptCredential,
  encryptCredential,
} from "@/lib/security/credentials";
import { AppError } from "@/lib/errors";

export type CredentialSummary = {
  provider: CredentialProvider;
  configured: boolean;
  status: "active" | "invalid" | "revoked" | "missing";
  keyHint: string | null;
  lastValidatedAt: Date | null;
  updatedAt: Date | null;
};

export async function listCredentialSummaries(
  userId: string,
): Promise<CredentialSummary[]> {
  const credentials = await prisma.providerCredential.findMany({
    where: { userId },
    select: {
      provider: true,
      status: true,
      keyHint: true,
      lastValidatedAt: true,
      updatedAt: true,
    },
  });
  const byProvider = new Map(credentials.map((item) => [item.provider, item]));

  return Object.values(CredentialProvider).map((provider) => {
    const credential = byProvider.get(provider);
    return {
      provider,
      configured: Boolean(credential),
      status: credential?.status ?? "missing",
      keyHint: credential?.keyHint ?? null,
      lastValidatedAt: credential?.lastValidatedAt ?? null,
      updatedAt: credential?.updatedAt ?? null,
    };
  });
}

export async function saveCredential(
  userId: string,
  provider: CredentialProvider,
  value: Record<string, string>,
) {
  const nonEmptyValue = Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry.trim().length > 0),
  );
  if (Object.keys(nonEmptyValue).length === 0) {
    throw new AppError("VALIDATION_ERROR", "凭证内容不能为空。", 400);
  }

  const encryptedPayload = encryptCredential(nonEmptyValue);
  return prisma.providerCredential.upsert({
    where: { userId_provider: { userId, provider } },
    update: {
      encryptedPayload,
      keyHint: credentialHint(nonEmptyValue),
      status: "active",
      lastValidatedAt: null,
    },
    create: {
      userId,
      provider,
      encryptedPayload,
      keyHint: credentialHint(nonEmptyValue),
    },
    select: {
      provider: true,
      status: true,
      keyHint: true,
      updatedAt: true,
    },
  });
}

export async function loadCredential(
  userId: string,
  provider: CredentialProvider,
): Promise<Record<string, string>> {
  const credential = await prisma.providerCredential.findUnique({
    where: { userId_provider: { userId, provider } },
    select: { encryptedPayload: true, status: true },
  });
  if (!credential || credential.status !== "active") {
    throw new AppError(
      "CREDENTIAL_NOT_CONFIGURED",
      `${provider} 凭证未配置或已失效。`,
      422,
    );
  }
  return decryptCredential(credential.encryptedPayload);
}

export async function deleteCredential(
  userId: string,
  provider: CredentialProvider,
) {
  await prisma.providerCredential.deleteMany({ where: { userId, provider } });
}
