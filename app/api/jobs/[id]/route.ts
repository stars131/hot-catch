import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { jobErrorMessageKey, safeJobErrorMessage } from "@/lib/jobs/error-messages";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const job = await prisma.processingJob.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        type: true,
        status: true,
        progress: true,
        stage: true,
        resultType: true,
        resultId: true,
        output: true,
        errorCode: true,
        errorMessage: true,
        attempts: true,
        maxAttempts: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
      },
    });
    if (!job) throw new AppError("NOT_FOUND", "任务不存在。", 404);
    const messageKey = jobErrorMessageKey(job.errorCode);
    return ok({
      job: {
        ...job,
        errorMessage: safeJobErrorMessage(messageKey),
        messageKey,
      },
    });
  } catch (error) {
    return fail(error);
  }
}
