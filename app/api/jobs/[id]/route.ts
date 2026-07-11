import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";

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
    return ok({ job });
  } catch (error) {
    return fail(error);
  }
}
