import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { branchConversation } from "@/lib/services/conversation-history-service";

const schema = z.object({ fromMessageId: z.string().cuid(), text: z.string().trim().min(1).max(12000) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = schema.parse(await request.json());
    return ok({ conversation: await branchConversation({ userId: user.id, conversationId: id, fromMessageId: input.fromMessageId, replacementText: input.text }) }, 201);
  } catch (error) {
    return fail(error);
  }
}
