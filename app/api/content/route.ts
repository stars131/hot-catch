import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { createContentProject } from "@/lib/services/content-project-service";
import { createContentProjectSchema } from "@/lib/validators/content-project";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = createContentProjectSchema.parse(await request.json());
    return ok({ content: await createContentProject(user.id, input) }, 201);
  } catch (error) {
    return fail(error);
  }
}
