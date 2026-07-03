import { getHotspotSourcePayload } from "@/lib/hotspots/hotspot-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 20;

export async function GET(_req: Request, context: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await context.params;
    return ok(await getHotspotSourcePayload(code));
  } catch (error) {
    return fail(error);
  }
}
