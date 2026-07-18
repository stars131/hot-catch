import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { isPlatformId, type UiLocale } from "@/lib/platforms/registry";
import { listCreativeDirections } from "@/lib/services/creative-direction-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireUser();
    const url = new URL(request.url);
    const platformValue = url.searchParams.get("platform");
    const locale = url.searchParams.get("locale") === "en-US" ? "en-US" : "zh-CN";
    const directions = await listCreativeDirections({
      q: url.searchParams.get("q") ?? undefined,
      category: url.searchParams.get("category") ?? undefined,
      platform: platformValue && isPlatformId(platformValue) ? platformValue : undefined,
      locale: locale satisfies UiLocale,
    });
    return ok({ directions });
  } catch (error) {
    return fail(error);
  }
}
