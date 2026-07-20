import { NextRequest } from "next/server";
import { getHotspotPayload } from "@/lib/hotspots/hotspot-service";
import { ok, fail } from "@/lib/http";
import { requireUser } from "@/lib/auth";
import { loadUserHotspotCookieStore } from "@/lib/hotspots/user-cookie-store";
import { enrichHotspotPayloadWithHistory } from "@/lib/hotspots/trend-history-service";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const searchParams = req.nextUrl.searchParams;
    const refresh = searchParams.get("refresh") === "1";
    const requestedLimit = Number.parseInt(searchParams.get("limit") ?? "36", 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(60, Math.max(1, requestedLimit))
      : 36;
    const payload = await getHotspotPayload({
      refresh,
      limit,
      credentialStore:
        process.env.NODE_ENV === "production"
          ? await loadUserHotspotCookieStore(user.id)
          : undefined,
    });
    return ok(await enrichHotspotPayloadWithHistory(user.id, payload));
  } catch (error) {
    return fail(error);
  }
}
