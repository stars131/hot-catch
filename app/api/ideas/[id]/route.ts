import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { updateIdea } from "@/lib/services/idea-service";
import { updateIdeaSchema } from "@/lib/validators/ideas";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = updateIdeaSchema.parse(await request.json());
    return ok({ idea: await updateIdea(user.id, id, input) });
  } catch (error) {
    return fail(error);
  }
}
