import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createGenerationBatch } from "@/lib/services/generation-batch-service";
import {
  generationBatchIdempotencyKeySchema,
  generationBatchSchema,
} from "@/lib/validators/generation-batch";
import { isUiLocale } from "@/lib/platforms/registry";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = generationBatchSchema.parse(await request.json());
    const header = request.headers.get("Idempotency-Key");
    const idempotencyKey = header
      ? generationBatchIdempotencyKeySchema.parse(header)
      : undefined;
    const cookieLocale = request.cookies.get("STARTRACE_UI_LOCALE")?.value;
    const uiLocale = isUiLocale(cookieLocale) ? cookieLocale : "zh-CN";
    const result = await createGenerationBatch({
      userId: user.id,
      conversationId: id,
      input,
      idempotencyKey,
      uiLocale,
    });
    return ok(result, result.replayed ? 200 : 202);
  } catch (error) {
    return fail(error);
  }
}
