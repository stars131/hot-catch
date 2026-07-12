import { CredentialProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AITOEARN_METADATA } from "@/lib/providers/aitoearn/metadata";
import type { ProviderConnectionMetadata } from "@/lib/providers/types";

/**
 * C9 连接层:AiToEarn 连接状态(只读本地凭证表)。
 *
 * - 绝不解密凭证、绝不返回 Key 原文,只返回脱敏提示与状态;
 * - 绝不调用真实供应商:connected 仅代表本地已配置有效凭证,
 *   真实可用性以发布中心实际加载账号为准。
 */

export type AiToEarnConnectionState = "connected" | "invalid" | "not_configured";

export type AiToEarnConnectionStatus = {
  provider: "aitoearn";
  connection: AiToEarnConnectionState;
  keyHint: string | null;
  lastValidatedAt: Date | null;
  updatedAt: Date | null;
  metadata: ProviderConnectionMetadata;
};

export async function getAiToEarnConnectionStatus(
  userId: string,
): Promise<AiToEarnConnectionStatus> {
  const credential = await prisma.providerCredential.findUnique({
    where: {
      userId_provider: { userId, provider: CredentialProvider.aitoearn },
    },
    select: { status: true, keyHint: true, lastValidatedAt: true, updatedAt: true },
  });
  const connection: AiToEarnConnectionState = !credential
    ? "not_configured"
    : credential.status === "active"
      ? "connected"
      : "invalid";
  return {
    provider: "aitoearn",
    connection,
    keyHint: credential?.keyHint ?? null,
    lastValidatedAt: credential?.lastValidatedAt ?? null,
    updatedAt: credential?.updatedAt ?? null,
    metadata: AITOEARN_METADATA,
  };
}
