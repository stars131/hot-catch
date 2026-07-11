import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { activateScoringRubric } from "@/lib/services/rubric-service";
import { activateScoringRubricSchema } from "@/lib/validators/scoring-rubric";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = activateScoringRubricSchema.parse(await request.json());
    return ok({ rubric: await activateScoringRubric(user.id, id, input) });
  } catch (error) {
    return fail(error);
  }
}
