import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getAiToEarnProvider } from "@/lib/services/publishing-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const provider = await getAiToEarnProvider(user.id);
    return ok({ accounts: await provider.listAccounts() });
  } catch (error) {
    return fail(error);
  }
}
