import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { chatRequestSchema } from "@/lib/validators/chat";
import { ensureConversation } from "@/lib/services/conversation-service";
import { handleChatMessage } from "@/lib/services/chat-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

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
    const result = await handleChatMessage({
      userId: user.id,
      conversationId: conversation.id,
      message: input.message,
      selectedPersonaId: input.selectedPersonaId,
      selectedBenchmarkAccountIds: input.selectedBenchmarkAccountIds,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
