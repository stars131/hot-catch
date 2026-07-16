import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { enqueueTrackingRefresh } from "@/lib/tracking/tracking-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const job = await enqueueTrackingRefresh(user.id, id);
    return ok({ jobId: job.id, status: job.status }, 202);
  } catch (error) {
    return fail(error);
  }
}
