import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { cancelJob } from "@/lib/jobs/queues";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    return ok({ job: await cancelJob(user.id, id) });
  } catch (error) {
    return fail(error);
  }
}
