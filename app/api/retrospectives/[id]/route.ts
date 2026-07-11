import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { fail, ok } from "@/lib/http";
import { updateRetrospective } from "@/lib/services/performance-service";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
const schema = z.object({
  status: z.enum(["drafted", "accepted", "dismissed"]).optional(),
  conclusions: z.string().max(10000).optional(),
  ruleProposal: z.unknown().optional(),
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = schema.parse(await request.json());
    return ok({ retrospective: await updateRetrospective(user.id, id, input) });
  } catch (error) {
    return fail(error);
  }
}
