import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getAiToEarnProvider } from "@/lib/services/publishing-service";
import { signAssetSchema } from "@/lib/validators/publishing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = signAssetSchema.parse(await request.json());
    const provider = await getAiToEarnProvider(user.id);
    return ok({ upload: await provider.signAssetUpload(input) });
  } catch (error) {
    return fail(error);
  }
}
