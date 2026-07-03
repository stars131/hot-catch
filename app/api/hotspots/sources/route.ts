import { listHotspotSourceDefinitions } from "@/lib/hotspots/hotspot-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    return ok({
      generatedAt: new Date().toISOString(),
      sources: listHotspotSourceDefinitions(),
    });
  } catch (error) {
    return fail(error);
  }
}
