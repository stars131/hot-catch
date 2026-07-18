import { createHash, randomUUID } from "node:crypto";
import { JobType, Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { fail, ok } from "@/lib/http";
import { enqueueJob } from "@/lib/jobs/queues";
import { isUiLocale } from "@/lib/platforms/registry";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contentId: string }> },
) {
  try {
    const user = await requireUser();
    const { id, contentId } = await params;
    const run = await prisma.agentRun.findFirst({
      where: { id, userId: user.id, command: "content.generate_bundle" },
    });
    if (!run) throw new AppError("NOT_FOUND", "创作包不存在。", 404);
    const content = await prisma.generatedContent.findFirst({
      where: { id: contentId, userId: user.id, conversationId: run.conversationId },
    });
    if (!content) throw new AppError("NOT_FOUND", "平台内容不存在。", 404);
    const runInput = asRecord(run.input);
    const skillIds = Array.isArray(runInput.skillIds)
      ? runInput.skillIds.filter((value): value is string => typeof value === "string")
      : [];
    const cookieLocale = request.cookies.get("STARTRACE_UI_LOCALE")?.value;
    const uiLocale = isUiLocale(cookieLocale) ? cookieLocale : "zh-CN";
    const requestKey = request.headers.get("Idempotency-Key")?.trim() || randomUUID();
    const idempotencyKey = createHash("sha256")
      .update(`${run.id}:${content.id}:${requestKey}`)
      .digest("hex");
    const job = await enqueueJob({
      userId: user.id,
      type: JobType.analysis,
      action: "content.generate",
      input: {
        contentId: content.id,
        conversationId: run.conversationId,
        skillIds,
        uiLocale,
      } as Prisma.InputJsonValue,
      idempotencyKey,
      agentRunId: run.id,
    });
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "running", completedAt: null, errorCode: null, errorMessage: null },
    });
    return ok({ jobId: job.id, contentId: content.id, status: job.status }, 202);
  } catch (error) {
    return fail(error);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
