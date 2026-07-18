import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { resumeWaitingJob } from "@/lib/jobs/queues";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const resumeSchema = z.object({
  text: z.string().trim().max(2000).optional(),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = resumeSchema.parse(await request.json().catch(() => ({})));
    return ok({ job: await resumeWaitingJob(user.id, id, body.text) }, 201);
  } catch (error) {
    return fail(error);
  }
}
