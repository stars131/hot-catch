import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { analyzeTrackedPublication } from "@/lib/tracking/tracking-service";

export const maxDuration = 60;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    return ok({ analysis: await analyzeTrackedPublication(user.id, id) }, 201);
  } catch (error) {
    return fail(error);
  }
}
