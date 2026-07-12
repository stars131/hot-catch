import { JobType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { enqueueJob } from "@/lib/jobs/queues";
import {
  preparePublishRecord,
  resolvePublishingProvider,
  submitPublishRecord,
} from "@/lib/services/publishing-service";
import { createPublishFlowSchema } from "@/lib/validators/publishing";

export const runtime = "nodejs";

/**
 * C10 provider-safe 发布入口。
 *
 * - 连接检查前置：凭证未配置/失效时显式返回 connection_required（422），
 *   不创建悬空发布记录，也不假装排队成功；
 * - mock 模式（开发/测试默认）：本地状态机同步执行模拟供应商，不联网、
 *   不入队，重复请求按幂等键返回同一记录现状，不重复提交；
 * - real 模式（生产强制，或显式 PUBLISH_PROVIDER_MODE=real）：保留既有
 *   BullMQ 异步执行路径，本批次不在任何测试/CI 中触发。
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = createPublishFlowSchema.parse(await request.json());
    const { mode } = await resolvePublishingProvider(user.id);
    const record = await preparePublishRecord(
      user.id,
      input,
      request.headers.get("Idempotency-Key") ?? undefined,
    );
    if (mode === "mock") {
      const result = await submitPublishRecord(user.id, record.id);
      return ok(
        { recordId: record.id, status: result.status, record: result, providerMode: mode },
        202,
      );
    }
    const job = await enqueueJob({
      userId: user.id,
      type: JobType.publish,
      action: "publish.create",
      input: { localRecordId: record.id, mode: "create" },
      idempotencyKey: record.idempotencyKey,
      maxAttempts: 2,
    });
    return ok(
      { recordId: record.id, jobId: job.id, status: record.status, providerMode: mode },
      202,
    );
  } catch (error) {
    return fail(error);
  }
}
