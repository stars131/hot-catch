import { listHotspotSourceDefinitions } from "@/lib/hotspots/hotspot-service";
import { ok, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { loadUserHotspotCookieStore } from "@/lib/hotspots/user-cookie-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const store = process.env.NODE_ENV === "production"
      ? await loadUserHotspotCookieStore(user.id)
      : undefined;
    return ok({
      generatedAt: new Date().toISOString(),
      sources: listHotspotSourceDefinitions(store),
    });
  } catch (error) {
    return fail(error);
  }
}
