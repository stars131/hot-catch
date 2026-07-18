import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { resolvePublishingProvider } from "@/lib/services/publishing-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const { provider, mode } = await resolvePublishingProvider(user.id);
    return ok({ accounts: await provider.listAccounts(), providerMode: mode });
  } catch (error) {
    return fail(error);
  }
}
