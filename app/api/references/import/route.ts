import { createHash } from "node:crypto";
import { JobType } from "@prisma/client";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { enqueueJob } from "@/lib/jobs/queues";
import { assertUrlSafe } from "@/lib/security/url-guard";

export const runtime = "nodejs";

const importReferenceSchema = z.object({
  url: z.string().url().max(2000),
  platform: z.enum(["xiaohongshu", "douyin"]).optional(),
  kind: z.enum(["account", "content", "webpage"]).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = importReferenceSchema.parse(await request.json());
    // 规范化 + SSRF 校验(协议、私网、内网域名、云元数据)
    const normalizedUrl = await assertUrlSafe(input.url);
    const idempotencyKey = createHash("sha256")
      .update(`${user.id}:${normalizedUrl}`)
      .digest("hex");
    const job = await enqueueJob({
      userId: user.id,
      type: JobType.ingest,
      action: "reference.import",
      input: { ...input, url: normalizedUrl },
      idempotencyKey,
    });
    return ok({ jobId: job.id, status: job.status }, 202);
  } catch (error) {
    return fail(error);
  }
}
