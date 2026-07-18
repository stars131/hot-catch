import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { chatRequestSchema } from "@/lib/validators/chat";
import { ensureConversation } from "@/lib/services/conversation-service";
import { handleUserMessage } from "@/lib/creator/agent-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

/**
 * LEGACY 兼容适配器。
 *
 * 旧命令式聊天逻辑(英文提示、/add-account 等)已停用;
 * 本路由只保留请求契约 { conversationId?, message } → { message },
 * 内部转调 C3 agent-service,回复与新消息 API 完全一致。
 * 新代码请直接使用 POST /api/conversations/:id/messages。
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const input = chatRequestSchema.parse(body);
    const conversation = await ensureConversation(
      user.id,
      input.conversationId,
      input.message
    );
    const result = await handleUserMessage({
      userId: user.id,
      conversationId: conversation.id,
      text: input.message,
      clientMessageId: `legacy-${crypto.randomUUID()}`,
    });
    return ok({
      conversationId: conversation.id,
      message: result.assistantMessage?.content ?? "",
      legacy: true,
    });
  } catch (error) {
    return fail(error);
  }
}
