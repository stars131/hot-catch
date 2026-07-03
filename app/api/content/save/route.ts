import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { saveContentSchema } from "@/lib/validators/content";
import { saveGeneratedContent } from "@/lib/services/content-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const input = saveContentSchema.parse(body);
    const content = await saveGeneratedContent(user.id, {
      contentId: input.contentId,
      conversationId: input.conversationId,
      personaId: input.personaId,
      title: input.title,
      inputText: input.inputText,
      fullMarkdown: input.fullMarkdown,
      status: input.status,
    });
    return ok({ content });
  } catch (error) {
    return fail(error);
  }
}
