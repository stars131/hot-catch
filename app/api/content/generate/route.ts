import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { generateContentSchema } from "@/lib/validators/content";
import { generateContent } from "@/lib/services/content-service";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const input = generateContentSchema.parse(body);
    const result = await generateContent({
      userId: user.id,
      inputType: input.inputType,
      inputText: input.inputText,
      personaId: input.personaId,
      benchmarkAccountIds: input.benchmarkAccountIds,
      outputType: input.outputType,
      conversationId: input.conversationId,
    });
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
