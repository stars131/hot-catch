import { JobType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { enqueueJob } from "@/lib/jobs/queues";
import { preparePublishRecord } from "@/lib/services/publishing-service";
import { createPublishFlowSchema } from "@/lib/validators/publishing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = createPublishFlowSchema.parse(await request.json());
    const record = await preparePublishRecord(
      user.id,
      input,
      request.headers.get("Idempotency-Key") ?? undefined,
    );
    const job = await enqueueJob({
      userId: user.id,
      type: JobType.publish,
      action: "publish.create",
      input: { localRecordId: record.id, mode: "create" },
      idempotencyKey: record.idempotencyKey,
      maxAttempts: 2,
    });
    return ok({ recordId: record.id, jobId: job.id, status: record.status }, 202);
  } catch (error) {
    return fail(error);
  }
}
