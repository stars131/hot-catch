import { IdeaStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createIdea, listIdeas } from "@/lib/services/idea-service";
import { createIdeaSchema } from "@/lib/validators/ideas";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const statusValue = new URL(request.url).searchParams.get("status");
    const status = statusValue
      ? Object.values(IdeaStatus).find((value) => value === statusValue)
      : undefined;
    return ok({ ideas: await listIdeas(user.id, status) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = createIdeaSchema.parse(await request.json());
    return ok({ idea: await createIdea(user.id, input) }, 201);
  } catch (error) {
    return fail(error);
  }
}
