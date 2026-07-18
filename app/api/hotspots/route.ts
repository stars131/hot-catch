import { NextRequest } from "next/server";
import { getHotspotPayload } from "@/lib/hotspots/hotspot-service";
import { ok, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { loadUserHotspotCookieStore } from "@/lib/hotspots/user-cookie-store";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const searchParams = req.nextUrl.searchParams;
    const refresh = searchParams.get("refresh") === "1";
    const limit = Number.parseInt(searchParams.get("limit") ?? "36", 10);
    const payload = await getHotspotPayload({
      refresh,
      limit: Number.isFinite(limit) ? limit : 36,
      credentialStore:
        process.env.NODE_ENV === "production"
          ? await loadUserHotspotCookieStore(user.id)
          : undefined,
    });
    return ok(payload);
  } catch (error) {
    return fail(error);
  }
}
