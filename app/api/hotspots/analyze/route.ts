import { requireUser } from "@/lib/auth";
import { analyzeHotspots } from "@/lib/hotspots/ai-insight-service";
import { fail, ok } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const result = await analyzeHotspots(user.id, await request.json());
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
