import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getAiToEarnProvider } from "@/lib/services/publishing-service";
import { aitoearnAuthStatusSchema } from "@/lib/validators/publishing";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const input = aitoearnAuthStatusSchema.parse({
      platform: url.searchParams.get("platform"),
      sessionId: url.searchParams.get("sessionId"),
    });
    const provider = await getAiToEarnProvider(user.id);
    return ok({ status: await provider.getAuthorizationStatus(input.platform, input.sessionId) });
  } catch (error) {
    return fail(error);
  }
}
