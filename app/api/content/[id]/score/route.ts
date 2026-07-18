import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { scoreContentProject } from "@/lib/services/scoring-service";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    return ok(await scoreContentProject(user.id, id));
  } catch (error) {
    return fail(error);
  }
}
