import {
  CredentialProvider,
  CredentialStatus,
  LlmProviderName,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  credentialHint,
  decryptCredential,
  encryptCredential,
} from "@/lib/security/credentials";
import { AppError } from "@/lib/errors";
import { isLlmProviderId } from "@/lib/providers/llm-config";

export type CredentialSummary = {
  provider: CredentialProvider;
  configured: boolean;
  status: "active" | "invalid" | "revoked" | "missing";
  keyHint: string | null;
  lastValidatedAt: Date | null;
  updatedAt: Date | null;
  configuration: { baseUrl: string | null; model: string | null } | null;
};

function readPublicConfiguration(metadata: Prisma.JsonValue | null) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const source = metadata as Record<string, unknown>;
  return {
    baseUrl: typeof source.baseUrl === "string" ? source.baseUrl : null,
    model: typeof source.model === "string" ? source.model : null,
  };
}

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
      metadata: true,
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
      configuration: readPublicConfiguration(credential?.metadata ?? null),
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
  const metadata = {
    ...(nonEmptyValue.baseUrl ? { baseUrl: nonEmptyValue.baseUrl } : {}),
    ...(nonEmptyValue.model ? { model: nonEmptyValue.model } : {}),
  } satisfies Prisma.InputJsonObject;
  return prisma.$transaction(async (transaction) => {
    const credential = await transaction.providerCredential.upsert({
      where: { userId_provider: { userId, provider } },
      update: {
        encryptedPayload,
        keyHint: credentialHint(nonEmptyValue),
        status: "active",
        metadata,
        lastValidatedAt: null,
      },
      create: {
        userId,
        provider,
        encryptedPayload,
        keyHint: credentialHint(nonEmptyValue),
        metadata,
      },
      select: {
        provider: true,
        status: true,
        keyHint: true,
        updatedAt: true,
      },
    });
    if (isLlmProviderId(provider)) {
      await transaction.user.updateMany({
        where: { id: userId, defaultLlmProvider: null },
        data: { defaultLlmProvider: provider as LlmProviderName },
      });
    }
    return credential;
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
  await prisma.$transaction(async (transaction) => {
    await transaction.providerCredential.deleteMany({ where: { userId, provider } });
    if (!isLlmProviderId(provider)) return;
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { defaultLlmProvider: true },
    });
    if (user?.defaultLlmProvider !== provider) return;
    const replacement = await transaction.providerCredential.findFirst({
      where: {
        userId,
        provider: { in: LLM_CREDENTIAL_PROVIDERS },
        status: CredentialStatus.active,
      },
      orderBy: { updatedAt: "desc" },
      select: { provider: true },
    });
    await transaction.user.update({
      where: { id: userId },
      data: {
        defaultLlmProvider: replacement
          ? (replacement.provider as LlmProviderName)
          : null,
      },
    });
  });
}

const LLM_CREDENTIAL_PROVIDERS = [
  CredentialProvider.deepseek,
  CredentialProvider.openai,
  CredentialProvider.grok,
];

export async function getDefaultLlmProvider(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultLlmProvider: true },
  });
  return user?.defaultLlmProvider ?? null;
}

export async function setDefaultLlmProvider(
  userId: string,
  provider: LlmProviderName,
) {
  const credential = await prisma.providerCredential.findUnique({
    where: {
      userId_provider: { userId, provider: provider as CredentialProvider },
    },
    select: { status: true },
  });
  if (!credential || credential.status !== CredentialStatus.active) {
    throw new AppError(
      "CREDENTIAL_NOT_CONFIGURED",
      "请先保存并启用该模型的凭证。",
      422,
    );
  }
  await prisma.user.update({
    where: { id: userId },
    data: { defaultLlmProvider: provider },
  });
  return provider;
}

export async function markCredentialValidated(
  userId: string,
  provider: CredentialProvider,
) {
  await prisma.providerCredential.updateMany({
    where: { userId, provider },
    data: { status: CredentialStatus.active, lastValidatedAt: new Date() },
  });
}

export async function markCredentialInvalid(
  userId: string,
  provider: CredentialProvider,
) {
  await prisma.providerCredential.updateMany({
    where: { userId, provider },
    data: { status: CredentialStatus.invalid },
  });
}
