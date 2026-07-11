import { getHotspotSourcePayload } from "@/lib/hotspots/hotspot-service";
import { ok, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { loadUserHotspotCookieStore } from "@/lib/hotspots/user-cookie-store";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET(_req: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const user = await requireUser();
    const { code } = await context.params;
    const store = process.env.NODE_ENV === "production"
      ? await loadUserHotspotCookieStore(user.id)
      : undefined;
    return ok(await getHotspotSourcePayload(code, store));
  } catch (error) {
    return fail(error);
  }
}
