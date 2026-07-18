import { CredentialProvider } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { ok, fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { LLM_PROVIDER_DEFINITIONS, LLM_PROVIDER_IDS } from "@/lib/providers/llm-config";
import { modelCapabilities } from "@/lib/providers/model-capabilities";

export async function GET() {
  try {
    const user = await requireUser();
    const credentials = await prisma.providerCredential.findMany({
      where: { userId: user.id, provider: { in: [...LLM_PROVIDER_IDS] as CredentialProvider[] } },
      select: { provider: true, status: true, metadata: true, lastValidatedAt: true },
    });
    const byProvider = new Map(credentials.map((credential) => [credential.provider, credential]));
    return ok({ models: LLM_PROVIDER_IDS.map((provider) => {
      const credential = byProvider.get(provider as CredentialProvider);
      const metadata = credential?.metadata && typeof credential.metadata === "object" && !Array.isArray(credential.metadata)
        ? credential.metadata as Record<string, unknown>
        : {};
      const model = typeof metadata.model === "string" ? metadata.model : LLM_PROVIDER_DEFINITIONS[provider].defaultModel;
      return {
        ...modelCapabilities(provider, model),
        health: credential?.status === "active" ? "healthy" : credential ? "degraded" : "unconfigured",
        checkedAt: credential?.lastValidatedAt?.toISOString() ?? null,
      };
    }) });
  } catch (error) {
    return fail(error);
  }
}
