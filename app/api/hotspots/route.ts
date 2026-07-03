import { NextRequest } from "next/server";
import { getHotspotPayload } from "@/lib/hotspots/hotspot-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const refresh = searchParams.get("refresh") === "1";
    const limit = Number.parseInt(searchParams.get("limit") ?? "36", 10);
    const payload = await getHotspotPayload({
      refresh,
      limit: Number.isFinite(limit) ? limit : 36,
    });
    return ok(payload);
  } catch (error) {
    return fail(error);
  }
}
