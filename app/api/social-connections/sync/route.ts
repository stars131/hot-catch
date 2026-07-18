import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { resolvePublishingProvider } from "@/lib/services/publishing-service";
import { syncAuthorizedAccounts } from "@/lib/services/social-connection-service";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    const { provider, mode } = await resolvePublishingProvider(user.id);
    const accounts = await provider.listAccounts();
    const connections = await syncAuthorizedAccounts(user.id, accounts, provider.name);
    return ok({ connections, providerMode: mode });
  } catch (error) {
    return fail(error);
  }
}
