import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createContentRevision } from "@/lib/services/content-project-service";
import { createRevisionSchema } from "@/lib/validators/content-project";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = createRevisionSchema.parse(await request.json());
    return ok({ revision: await createContentRevision(user.id, id, input) }, 201);
  } catch (error) {
    return fail(error);
  }
}
