import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getAiToEarnProvider } from "@/lib/services/publishing-service";
import { aitoearnAuthSchema } from "@/lib/validators/publishing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { platform } = aitoearnAuthSchema.parse(await request.json());
    const provider = await getAiToEarnProvider(user.id);
    return ok(await provider.getAuthorizationUrl(platform));
  } catch (error) {
    return fail(error);
  }
}
