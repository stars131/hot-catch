import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  ensureConversation,
  listConversations,
} from "@/lib/services/conversation-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const conversations = await listConversations(user.id);
    return ok({ conversations });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json().catch(() => ({}));
    const conversation = await ensureConversation(
      user.id,
      undefined,
      typeof body?.title === "string" ? body.title : undefined
    );
    return ok({ conversation }, 201);
  } catch (error) {
    return fail(error);
  }
}
