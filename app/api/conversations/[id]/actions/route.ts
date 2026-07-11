import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { invokeCardActionRequestSchema } from "@/lib/creator/chat-schemas";
import { invokeCardAction } from "@/lib/creator/agent-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    // 客户端只允许提交 clientActionId / sourceMessageId / cardId / actionId / values;
    // contentId、userId、providerKey 等权威参数一律由服务端解析。
    const input = invokeCardActionRequestSchema.parse(await req.json());
    const result = await invokeCardAction({
      userId: user.id,
      conversationId: id,
      clientActionId: input.clientActionId,
      sourceMessageId: input.sourceMessageId,
      cardId: input.cardId,
      actionId: input.actionId,
      values: input.values,
    });
    return ok(result, result.replayed ? 200 : 201);
  } catch (error) {
    return fail(error);
  }
}
