import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getContentPerformance } from "@/lib/services/performance-service";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    return ok({ performance: await getContentPerformance(user.id, id) });
  } catch (error) {
    return fail(error);
  }
}
