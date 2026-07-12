import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { resolvePublishingProvider } from "@/lib/services/publishing-service";
import { confirmAssetSchema } from "@/lib/validators/publishing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { assetId } = confirmAssetSchema.parse(await request.json());
    const { provider, mode } = await resolvePublishingProvider(user.id);
    return ok({ asset: await provider.confirmAssetUpload(assetId), providerMode: mode });
  } catch (error) {
    return fail(error);
  }
}
