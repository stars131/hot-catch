import { createHash } from "node:crypto";
import { JobType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { enqueueJob } from "@/lib/jobs/queues";
import { buildStyleProfileSchema } from "@/lib/validators/style-profile";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = buildStyleProfileSchema.parse(await request.json());
    const idempotencyKey = createHash("sha256")
      .update(`${user.id}:${input.platform}:${[...input.noteIds].sort().join(",")}`)
      .digest("hex");
    const job = await enqueueJob({
      userId: user.id,
      type: JobType.analysis,
      action: "style-profile.build",
      input,
      idempotencyKey,
    });
    return ok({ jobId: job.id, status: job.status }, 202);
  } catch (error) {
    return fail(error);
  }
}
