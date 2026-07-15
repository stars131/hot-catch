import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { sendMessageRequestSchema } from "@/lib/creator/chat-schemas";
import {
  handleUserMessage,
  listConversationMessages,
} from "@/lib/creator/agent-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
    const result = await listConversationMessages({
      userId: user.id,
      conversationId: id,
      cursor,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = sendMessageRequestSchema.parse(await req.json());
    const text = input.parts
      .map((part) => {
        if (part.type === "text") return part.text;
        if (part.type === "reference_url") return part.url;
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
    if (!text) return fail(new Error("消息内容不能为空。"));

    const result = await handleUserMessage({
      userId: user.id,
      conversationId: id,
      text,
      clientMessageId: input.clientMessageId,
      skillIds: input.context?.skillIds,
      patchTarget: input.context?.patchTarget,
      publishTarget: input.context?.publishTarget,
    });
    return ok(
      {
        userMessage: result.userMessage,
        assistantMessage: result.assistantMessage,
        run: result.run,
        replayed: result.replayed,
      },
      result.replayed ? 200 : 201,
    );
  } catch (error) {
    return fail(error);
  }
}
