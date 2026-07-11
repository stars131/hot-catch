import { createHash } from "node:crypto";
import { JobType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { enqueueJob } from "@/lib/jobs/queues";
import { getPublishRecord } from "@/lib/services/publishing-service";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const record = await getPublishRecord(user.id, id);
    if (record.status !== "failed") {
      throw new AppError("CONFLICT", "只有失败的发布记录可以重试。", 409);
    }
    const retryKey = createHash("sha256")
      .update(`${record.id}:retry:${record.attemptCount}`)
      .digest("hex");
    const job = await enqueueJob({
      userId: user.id,
      type: JobType.publish,
      action: "publish.retry",
      input: { localRecordId: record.id, mode: "retry" },
      idempotencyKey: retryKey,
      maxAttempts: 2,
    });
    return ok({ jobId: job.id, recordId: record.id }, 202);
  } catch (error) {
    return fail(error);
  }
}
