import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import {
  createScoringRubricVersion,
  listScoringRubrics,
} from "@/lib/services/rubric-service";
import { createScoringRubricSchema } from "@/lib/validators/scoring-rubric";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ rubrics: await listScoringRubrics(user.id) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = createScoringRubricSchema.parse(await request.json());
    return ok({ rubric: await createScoringRubricVersion(user.id, input) }, 201);
  } catch (error) {
    return fail(error);
  }
}
