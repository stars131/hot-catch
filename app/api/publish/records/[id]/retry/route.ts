import { createHash } from "node:crypto";
import { JobType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { resolvePublishProviderMode } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { enqueueJob } from "@/lib/jobs/queues";
import {
  getPublishRecord,
  retryPublishRecord,
} from "@/lib/services/publishing-service";
import { isPublishRecordRetryable } from "@/lib/services/publish-state-machine";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * 受控重试：只有 failed 记录可重试。mock 模式同步走本地状态机
 * （先查询供应商状态再决定是否重发）；real 模式保留 BullMQ 队列路径。
 */
export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const record = await getPublishRecord(user.id, id);
    if (!isPublishRecordRetryable(record.status)) {
      throw new AppError("CONFLICT", "只有失败的发布记录可以重试。", 409);
    }
    const mode = resolvePublishProviderMode();
    if (mode === "mock") {
      const result = await retryPublishRecord(user.id, id);
      return ok(
        { recordId: id, status: result.status, record: result, providerMode: mode },
        202,
      );
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
    return ok({ jobId: job.id, recordId: record.id, providerMode: mode }, 202);
  } catch (error) {
    return fail(error);
  }
}
