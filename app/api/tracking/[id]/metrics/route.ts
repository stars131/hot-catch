import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { saveManualMetrics } from "@/lib/tracking/tracking-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const snapshot = await saveManualMetrics(user.id, id, await request.json());
    return ok({ snapshot }, 201);
  } catch (error) {
    return fail(error);
  }
}
