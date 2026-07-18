import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { getConversationContextUsage } from "@/lib/services/conversation-history-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return ok(await getConversationContextUsage(user.id, id));
  } catch (error) {
    return fail(error);
  }
}
