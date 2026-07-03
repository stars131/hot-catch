import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  deleteConversation,
  getConversationWithMessages,
} from "@/lib/services/conversation-service";
import { AppError } from "@/lib/errors";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const conversation = await getConversationWithMessages(user.id, id);
    if (!conversation) throw new AppError("NOT_FOUND", "Conversation not found.", 404);
    return ok({ conversation });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await deleteConversation(user.id, id);
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
