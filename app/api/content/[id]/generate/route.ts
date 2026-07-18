import { createHash } from "node:crypto";
import { JobType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { enqueueJob } from "@/lib/jobs/queues";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const content = await prisma.generatedContent.findFirst({
      where: { id, userId: user.id },
      select: { id: true, updatedAt: true },
    });
    if (!content) throw new AppError("NOT_FOUND", "内容项目不存在。", 404);
    const requestedKey = request.headers.get("Idempotency-Key")?.trim();
    const idempotencyKey = createHash("sha256")
      .update(requestedKey || `${user.id}:${id}:${content.updatedAt.toISOString()}`)
      .digest("hex");
    const job = await enqueueJob({
      userId: user.id,
      type: JobType.analysis,
      action: "content.generate",
      input: { contentId: id },
      idempotencyKey,
    });
    return ok({ jobId: job.id, status: job.status }, 202);
  } catch (error) {
    return fail(error);
  }
}
